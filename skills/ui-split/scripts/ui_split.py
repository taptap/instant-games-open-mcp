"""File-only UI slicing coordinator; external model calls are performed by the Agent."""

import argparse
import hashlib
import json
import os
import re
import unicodedata
import subprocess
from pathlib import Path
from PIL import Image

PROMPTS = json.loads(Path(__file__).with_name("prompts.json").read_text())


def domain(operation, **values):
    """Use the pinned upstream validator and batch planner without a second implementation."""
    result = subprocess.run(
        ["node", str(Path(__file__).with_name("domain.mjs"))],
        input=json.dumps(dict(operation=operation, **values)),
        capture_output=True,
        text=True,
    )
    if result.returncode:
        raise ValueError("UI domain validation failed: " + result.stderr[-1000:])
    return json.loads(result.stdout)


def project_file(root, value):
    """Resolve an existing project image without crossing project or symlink boundaries."""
    value = value.removeprefix("/workspace/")
    relative = Path(value)
    if (
        relative.is_absolute()
        or not value.startswith("assets/")
        or any(p.startswith(".") for p in relative.parts)
    ):
        raise ValueError("Expected a project assets/ path")
    path = root / relative
    if any(part.is_symlink() for part in [path, *path.parents] if part != root.parent):
        raise ValueError("Symlink sources are not supported")
    if not path.resolve().is_relative_to(root):
        raise ValueError("Source leaves the project")
    return path


def identity(root, value):
    """Return the original byte identity and actual pixel dimensions."""
    path = project_file(root, value)
    with Image.open(path) as image:
        width, height = image.size
        if width * height > 4096 * 4096 or max(width, height) > 8192:
            raise ValueError("Image exceeds recognition limits")
    if path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError("Image exceeds 10 MiB")
    return dict(
        path=path.relative_to(root).as_posix(),
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        width=width,
        height=height,
    )


def save(path, state):
    """Atomically publish one authoritative progress snapshot."""
    state["revision"] = state.get("revision", 0) + 1
    temporary = path.with_suffix(f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def descriptor(state, root):
    """Describe the next external action; completed work is never submitted again."""
    phase = state["phase"]
    base = Path(state["directory"])
    source = state["design"]
    if identity(root, source["path"]) != source:
        raise ValueError("Original image changed; start a new named run")
    if phase == "remove_text":
        return dict(
            tool="edit_image",
            image=source["path"],
            target_size=f"{source['width']}x{source['height']}",
            prompt="仅移除参考 UI 中的文字、字母和数字，用原底板纹理修复。保留所有图标、按钮底板、人物和场景，构图、位置和比例不变。不要新增文字或标记。",
            name=f"ui-split/{state['name']}/text-free",
        )
    if phase in ("recognize_elements", "recognize_text"):
        image = state["cut"] if phase == "recognize_elements" else source
        if identity(root, image["path"]) != image:
            raise ValueError("Recognition source changed")
        prompt = (
            PROMPTS["cut" if phase == "recognize_elements" else "text"]
            .replace("1234567", str(image["width"]))
            .replace("7654321", str(image["height"]))
        )
        if phase == "recognize_text":
            prompt += "\n本轮不附带切图清单，parentId 全部填写 null。本地按文字中心所在的最小底板关联父级。"
        key = hashlib.sha256((state["name"] + source["sha256"]).encode()).hexdigest()[
            :32
        ]
        return dict(
            tool="recognize_ui",
            action="submit",
            request_key="ui:" + key + ":" + phase,
            image=image["path"],
            prompt=prompt,
        )
    if phase == "separate":
        batch = state["batches"][state["batch"]]
        if any(
            identity(root, expected["path"]) != expected
            for expected in (state["design"], state["cut"])
        ):
            raise ValueError(
                "Bbox source changed; preserve this run and start a new named run"
            )
        return dict(
            tool="edit_image",
            image=batch["reference"],
            target_size="1024x1024",
            transparent=True,
            prompt=batch["prompt"],
            name=f"ui-split/{state['name']}/batch-{state['batch']}",
        )
    return dict(
        kind="review" if phase == "review" else "done",
        directory=base.as_posix(),
        bindings=(base / "bindings.json").as_posix(),
    )


def plan_batches(state, root):
    """Prelayout type/shape-compatible slots and preserve duplicate instance bindings."""
    bbox = state["bbox"]
    plans = domain("plans", bbox=bbox)
    batches = []
    with Image.open(project_file(root, state["cut"]["path"])) as source:
        source = source.convert("RGBA")
        for plan in plans:
            chunk = plan["slots"]
            columns, rows = plan["columns"], plan["rows"]
            reference = Image.new("RGBA", (1024, 1024))
            for index, slot in enumerate(chunk):
                if slot.get("reserve"):
                    continue
                element = next(
                    e for e in bbox["elements"] if e["id"] == slot["elementId"]
                )
                x, y, w, h = element["bbox"]
                sx = source.width / bbox["design"]["width"]
                sy = source.height / bbox["design"]["height"]
                tile = source.crop(
                    (
                        round(x * sx),
                        round(y * sy),
                        round((x + w) * sx),
                        round((y + h) * sy),
                    )
                )
                tile.thumbnail(
                    (max(1, int(1024 / columns * 0.8)), max(1, int(1024 / rows * 0.8)))
                )
                left = int((index % columns + 0.5) * 1024 / columns - tile.width / 2)
                top = int((index // columns + 0.5) * 1024 / rows - tile.height / 2)
                reference.alpha_composite(tile, (left, top))
            path = Path(state["directory"]) / f"prelayout-{len(batches)}.png"
            reference.save(root / path)
            batches.append(
                dict(
                    reference=path.as_posix(),
                    columns=columns,
                    rows=rows,
                    slots=chunk,
                    prompt=plan["prompt"],
                    group=plan["group"],
                )
            )
            state["artifacts"].append(
                dict(
                    key=f"prelayout-{len(batches)-1}",
                    title="预排参考图",
                    path=path.as_posix(),
                )
            )
    state["batches"], state["batch"] = batches, 0
    state["phase"] = "separate" if batches else "review"



def valid_task_name(name):
    """Match the canvas rule: Unicode letters or numbers, plus underscore and hyphen."""
    if not isinstance(name, str) or not 1 <= len(name) <= 40:
        return False
    for char in name:
        if char in "_-":
            continue
        category = unicodedata.category(char)
        if not (category.startswith("L") or category.startswith("N")):
            return False
    return True


def record(state, root, args):
    """Accept only the pending action result and never reinterpret unknown as failure."""
    action = state.get("pending")
    if not action or args.action_id != action["id"]:
        raise ValueError("Action ID does not match the saved pending action")
    phase = state["phase"]
    if identity(root, state["design"]["path"]) != state["design"]:
        raise ValueError("Original source changed")
    if phase != "remove_text" and identity(root, state["cut"]["path"]) != state["cut"]:
        raise ValueError("Text-free source changed")
    if args.file and phase == "remove_text":
        original = project_file(root, args.file)
        target = root / state["directory"] / "text-free.png"
        with Image.open(original) as image:
            image.convert("RGBA").save(target)
        args.file = target.relative_to(root).as_posix()
    if action["tool"] == "recognize_ui":
        response_path = root / args.response
        if not response_path.resolve().is_relative_to(root):
            raise ValueError("Response file leaves project")
        envelope = json.loads(response_path.read_text())
        result = envelope.get("result", envelope)
        request_id = result.get("request_id")
        if request_id:
            action["request_id"] = request_id
        if result.get("status") != "succeeded":
            state["error"] = result.get("error") or "Original request is still running"
            return
        output = result["output"]
        image = state["cut"] if phase == "recognize_elements" else state["design"]
        expected = "cut" if phase == "recognize_elements" else "text"
        if (
            result.get("model") != "gpt-6.1-sol"
            or result.get("reasoning_effort") != "low"
            or output.get("pass") != expected
            or output.get("image") != dict(width=image["width"], height=image["height"])
        ):
            raise ValueError("Recognition model, pass or dimensions mismatch")
        if expected == "cut":
            elements = domain(
                "cut",
                elements=output.get("elements"),
                width=image["width"],
                height=image["height"],
            )
            if not elements:
                raise ValueError("No cut elements returned")
            for element in elements:
                if element.get("type") not in (
                    "icon",
                    "frame",
                    "panel",
                    "button",
                    "tab",
                    "title",
                ):
                    raise ValueError("Invalid cut element type")
                ids = {entry["id"] for entry in elements}
                duplicate = element.get("duplicateOf")
                if element.get("parent") is not None and element["parent"] not in ids:
                    raise ValueError("Element parent does not exist")
                if duplicate and (
                    duplicate not in ids
                    or duplicate == element["id"]
                    or next(
                        entry for entry in elements if entry["id"] == duplicate
                    ).get("duplicateOf")
                ):
                    raise ValueError("Invalid duplicate binding")
                element["bbox"] = [
                    v
                    * state["design"]["width" if i % 2 == 0 else "height"]
                    / image["width" if i % 2 == 0 else "height"]
                    for i, v in enumerate(element["bbox"])
                ]
            state["elements"] = elements
            state["phase"] = "recognize_text"
        else:
            texts = domain(
                "text",
                texts=output.get("texts"),
                width=image["width"],
                height=image["height"],
                elements=state["elements"],
            )
            if any(
                t.get("cutout") is not False
                or not isinstance(t.get("text"), str)
                or not t["text"].strip()
                or not re.fullmatch(r"#[0-9a-fA-F]{6}", t.get("color", ""))
                for t in texts
            ):
                raise ValueError("Ordinary text must not be cut into PNG")
            for text in texts:
                x, y, w, h = text["bbox"]
                parents = [
                    element
                    for element in state["elements"]
                    if element["type"] != "icon"
                    and element["bbox"][0]
                    <= x + w / 2
                    < element["bbox"][0] + element["bbox"][2]
                    and element["bbox"][1]
                    <= y + h / 2
                    < element["bbox"][1] + element["bbox"][3]
                ]
                text["parentId"] = (
                    min(parents, key=lambda e: e["bbox"][2] * e["bbox"][3])["id"]
                    if parents
                    else None
                )
            state["bbox"] = dict(
                version=1,
                coordinateSpace="design-pixels",
                bboxFormat="xywh",
                design=state["design"],
                cutSource=state["cut"],
                elements=state["elements"],
                texts=texts,
            )
            (root / state["directory"] / "bbox.json").write_text(
                json.dumps(state["bbox"], ensure_ascii=False, indent=2)
            )
            plan_batches(state, root)
    elif phase == "remove_text":
        state["cut"] = identity(root, args.file)
        state["artifacts"].append(
            dict(key="text-free", title="去文字图", path=state["cut"]["path"])
        )
        state["phase"] = "recognize_elements"
    else:
        batch = state["batches"][state["batch"]]
        separated = (
            root
            / state["directory"]
            / f"separated-{state.get('batch', 0)}-g{state.get('generation', 0)}.png"
        )
        with Image.open(project_file(root, args.file)) as sheet:
            sheet = sheet.convert("RGBA")
            prepared = []
            for index, slot in enumerate(batch["slots"]):
                if slot.get("reserve"):
                    continue
                column, row = index % batch["columns"], index // batch["columns"]
                tile = sheet.crop(
                    (
                        column * sheet.width // batch["columns"],
                        row * sheet.height // batch["rows"],
                        (column + 1) * sheet.width // batch["columns"],
                        (row + 1) * sheet.height // batch["rows"],
                    )
                )
                # Background batches are prompted to fill the frame, so a fully opaque tile is valid.
                if (
                    batch.get("group") != "background"
                    and tile.getchannel("A").getextrema()[0] == 255
                ):
                    raise ValueError(
                        "Sheet has no transparent background; preserve original task and review"
                    )
                content = tile.getbbox()
                if not content:
                    raise ValueError("A required slot is empty")
                prepared.append((slot, tile.crop(content)))
            sheet.save(separated)
            for slot, tile in prepared:
                key = slot["elementId"] + "-" + slot["state"]
                path = Path(state["directory"]) / (
                    key + "-g" + str(state.get("generation", 0)) + ".png"
                )
                tile.save(root / path)
                state["bindings"] = [
                    entry
                    for entry in state["bindings"]
                    if (entry["elementId"], entry["state"])
                    != (slot["elementId"], slot["state"])
                ]
                state["artifacts"] = [
                    entry for entry in state["artifacts"] if entry["key"] != key
                ]
                state["bindings"].append(
                    dict(
                        **slot,
                        path=path.as_posix(),
                        width=tile.width,
                        height=tile.height,
                    )
                )
                state["artifacts"].append(
                    dict(
                        key=key,
                        title=slot["elementId"] + " " + slot["state"],
                        path=path.as_posix(),
                    )
                )
        batch["result"] = identity(root, separated.relative_to(root).as_posix())
        state["batch"] += 1
        if state["batch"] == len(state["batches"]) or state.pop("redo_only", False):
            (root / state["directory"] / "bindings.json").write_text(
                json.dumps(
                    dict(
                        version=1,
                        elements=state["bbox"]["elements"],
                        assets=state["bindings"],
                    ),
                    ensure_ascii=False,
                    indent=2,
                )
            )
            state["phase"] = "review"
    state.pop("pending", None)
    state.pop("error", None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command", choices=["init", "next", "record", "status", "approve"]
    )
    parser.add_argument("--name", required=True)
    parser.add_argument("--source")
    parser.add_argument("--action-id")
    parser.add_argument("--file")
    parser.add_argument("--response")
    parser.add_argument("--redo-batch", type=int)
    parser.add_argument("--confirm-new-generation", action="store_true")
    args = parser.parse_args()
    if not valid_task_name(args.name):
        raise ValueError(
            "Name must contain 1 to 40 letters, digits, underscore or hyphen"
        )
    root = Path.cwd().resolve()
    directory = root / "assets/image/ui-split" / args.name
    if any(p.is_symlink() for p in [directory, *directory.parents]):
        raise ValueError("Run directory must not be a symlink")
    progress_dir = root / "docs/.ui-split"
    if progress_dir.is_symlink() or (root / "docs").is_symlink():
        raise ValueError("Progress directory must not be a symlink")
    progress_dir.mkdir(parents=True, exist_ok=True)
    path = progress_dir / (args.name + ".json")
    if path.is_symlink():
        raise ValueError("Progress file must not be a symlink")
    if path.exists():
        state = json.loads(path.read_text())
        if (
            args.command == "init"
            and args.source
            and identity(root, args.source) != state["design"]
        ):
            raise ValueError(
                "This name belongs to a different design; choose a new run name"
            )
    elif args.command == "init":
        source = identity(root, args.source)
        directory.mkdir(parents=True, exist_ok=True)
        state = dict(
            version=1,
            name=args.name,
            phase="remove_text",
            design=source,
            directory=directory.relative_to(root).as_posix(),
            artifacts=[dict(key="original", title="原始设计稿", path=source["path"])],
            bindings=[],
        )
    else:
        raise ValueError("Run not found; initialize it with the original image")
    if args.redo_batch is not None:
        if (
            not args.confirm_new_generation
            or state.get("pending")
            or state["phase"] not in ("review", "done")
        ):
            raise ValueError(
                "Redo requires explicit new-generation confirmation after the original action is settled"
            )
        if not 0 <= args.redo_batch < len(state.get("batches", [])):
            raise ValueError("Batch does not exist")
        state["phase"], state["batch"] = "separate", args.redo_batch
        state["redo_only"] = True
        state["generation"] = state.get("generation", 0) + 1
    if args.command == "record":
        try:
            record(state, root, args)
        except Exception as error:
            state["error"] = str(error)
            save(path, state)
            raise
    if args.command == "approve":
        if state["phase"] != "review":
            raise ValueError("Complete all batches before review")
        state["phase"] = "done"
    if args.command == "next" and state["phase"] not in ("review", "done"):
        if not state.get("pending"):
            state["pending"] = dict(
                id=state["name"]
                + ":"
                + state["phase"]
                + ":"
                + str(state.get("batch", 0))
                + ":"
                + str(state.get("generation", 0)),
                **descriptor(state, root),
            )
            state["pending"]["issued"] = False
        action = dict(state["pending"])
        if action.get("issued"):
            if action.get("request_id"):
                action = dict(
                    id=action["id"],
                    tool="recognize_ui",
                    action="query",
                    request_id=action["request_id"],
                )
            else:
                action = dict(
                    id=action["id"],
                    kind="unknown",
                    message="Action was already issued. Reconcile its original result; do not regenerate.",
                )
        state["pending"]["issued"] = True
    else:
        action = (
            dict(kind="recorded" if args.command == "record" else "initialized")
            if args.command in ("init", "record", "status")
            else descriptor(state, root)
        )
    save(path, state)
    print(
        json.dumps(
            dict(
                action=action,
                phase=state["phase"],
                directory=state["directory"],
                error=state.get("error"),
            ),
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
