import json
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw

SCRIPT = Path(__file__).parents[1] / "scripts/ui_split.py"


def call(root, command, *args):
    result = subprocess.run(
        [sys.executable, str(SCRIPT), command, "--name", "inventory", *args],
        cwd=root,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_resume_never_reissues_pending_paid_action(tmp_path):
    (tmp_path / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(tmp_path / "assets/design.png")
    call(tmp_path, "init", "--source", "assets/design.png")
    first = call(tmp_path, "next")["action"]
    assert first["tool"] == "edit_image"
    second = call(tmp_path, "next")["action"]
    assert second["kind"] == "unknown"
    assert second["id"] == first["id"]


def test_two_pass_crop_and_review(tmp_path):
    (tmp_path / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(tmp_path / "assets/design.png")
    call(tmp_path, "init", "--source", "assets/design.png")
    action = call(tmp_path, "next")["action"]
    call(tmp_path, "record", "--action-id", action["id"], "--file", "assets/design.png")
    for phase, output in [
        (
            "cut",
            {
                "elements": [
                    {
                        "id": "E001",
                        "name": "按钮",
                        "type": "button",
                        "bbox": [10, 10, 40, 20],
                        "parent": None,
                    }
                ]
            },
        ),
        ("text", {"texts": []}),
    ]:
        action = call(tmp_path, "next")["action"]
        response = {
            "model": "gpt-6.1-sol",
            "reasoning_effort": "low",
            "status": "succeeded",
            "request_id": "original",
            "output": {"pass": phase, "image": {"width": 100, "height": 100}, **output},
        }
        (tmp_path / "response.json").write_text(json.dumps(response))
        call(
            tmp_path,
            "record",
            "--action-id",
            action["id"],
            "--response",
            "response.json",
        )
    action = call(tmp_path, "next")["action"]
    assert action["transparent"] is True
    sheet = Image.new("RGBA", (1024, 1024))
    draw = ImageDraw.Draw(sheet)
    progress = json.loads((tmp_path / "docs/.ui-split/inventory.json").read_text())
    batch = progress["batches"][0]
    for index, slot in enumerate(batch["slots"]):
        if slot.get("reserve"):
            continue
        column, row = index % batch["columns"], index // batch["columns"]
        left, top = column * 1024 // batch["columns"], row * 1024 // batch["rows"]
        right, bottom = (column + 1) * 1024 // batch["columns"], (
            row + 1
        ) * 1024 // batch["rows"]
        draw.rectangle(
            (left + 20, top + 20, right - 20, bottom - 20),
            fill="red" if index % 2 == 0 else "blue",
        )
    sheet.save(tmp_path / "assets/sheet.png")
    call(tmp_path, "record", "--action-id", action["id"], "--file", "assets/sheet.png")
    assert call(tmp_path, "next")["action"]["kind"] == "review"
    call(tmp_path, "approve")
    assert call(tmp_path, "next")["action"]["kind"] == "done"
    bindings = json.loads(
        (tmp_path / "assets/image/ui-split/inventory/bindings.json").read_text()
    )
    assert len(bindings["assets"]) == 2
    assert (
        json.loads((tmp_path / "docs/.ui-split/inventory.json").read_text())["phase"]
        == "done"
    )
    redo = call(tmp_path, "next", "--redo-batch", "0", "--confirm-new-generation")[
        "action"
    ]
    assert redo["tool"] == "edit_image"
    assert redo["id"] != action["id"]
    call(tmp_path, "record", "--action-id", redo["id"], "--file", "assets/sheet.png")
    assert call(tmp_path, "next")["action"]["kind"] == "review"
    assert (
        len(
            json.loads(
                (tmp_path / "assets/image/ui-split/inventory/bindings.json").read_text()
            )["assets"]
        )
        == 2
    )

def run(root, *args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=root,
        capture_output=True,
        text=True,
    )


def prepare_separate(root, elements, name="inventory", texts=None, source="assets/design.png"):
    (root / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(root / source)
    Image.new("RGB", (100, 100), "red").save(root / "assets/text-free.png")
    result = run(root, "init", "--name", name, "--source", source)
    assert result.returncode == 0, result.stderr
    nxt = run(root, "next", "--name", name)
    assert nxt.returncode == 0, nxt.stderr
    action = json.loads(nxt.stdout)["action"]
    result = run(root, "record", "--name", name, "--action-id", action["id"], "--file", "assets/text-free.png")
    assert result.returncode == 0, result.stderr
    for phase, output in [
        ("cut", {"elements": elements}),
        ("text", {"texts": texts or []}),
    ]:
        action = json.loads(run(root, "next", "--name", name).stdout)["action"]
        (root / "response.json").write_text(json.dumps({
            "model": "gpt-6.1-sol",
            "reasoning_effort": "low",
            "status": "succeeded",
            "request_id": "original",
            "output": {"pass": phase, "image": {"width": 100, "height": 100}, **output},
        }))
        result = run(root, "record", "--name", name, "--action-id", action["id"], "--response", "response.json")
        assert result.returncode == 0, result.stderr
    action = json.loads(run(root, "next", "--name", name).stdout)["action"]
    progress = json.loads((root / "docs/.ui-split" / (name + ".json")).read_text())
    return action, progress


def paint(batch, fills):
    sheet = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    for index, slot in enumerate(batch["slots"]):
        if slot.get("reserve"):
            continue
        column, row = index % batch["columns"], index // batch["columns"]
        left, top = column * 1024 // batch["columns"], row * 1024 // batch["rows"]
        right = (column + 1) * 1024 // batch["columns"]
        bottom = (row + 1) * 1024 // batch["rows"]
        fill = fills[index]
        if fill == "content":
            draw.rectangle((left + 20, top + 20, right - 20, bottom - 20), fill=(255, 0, 0, 255))
        elif fill == "opaque":
            draw.rectangle((left, top, right - 1, bottom - 1), fill=(0, 128, 0, 255))
    return sheet


def test_task_name_matches_canvas_unicode_rule(tmp_path):
    (tmp_path / "assets").mkdir()
    Image.new("RGB", (20, 20), "red").save(tmp_path / "assets/design.png")
    for name in ["_inventory", "-inventory", "背包", "装备_1"]:
        result = run(tmp_path, "init", "--name=" + name, "--source", "assets/design.png")
        assert result.returncode == 0, (name, result.stderr)
    for name in ["", "a" * 41, "inv entory", "../inventory"]:
        result = run(tmp_path, "init", "--name=" + name, "--source", "assets/design.png")
        assert result.returncode != 0


def test_background_batch_accepts_opaque_sheet(tmp_path):
    action, progress = prepare_separate(tmp_path, [{
        "id": "E001",
        "name": "场景",
        "type": "panel",
        "bbox": [0, 0, 100, 100],
        "parent": None,
    }])
    assert progress["batches"][0]["group"] == "background"
    sheet = paint(progress["batches"][0], {0: "opaque"})
    sheet.save(tmp_path / "assets/sheet.png")
    result = run(tmp_path, "record", "--name", "inventory", "--action-id", action["id"], "--file", "assets/sheet.png")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["phase"] == "review"


def test_failed_slot_does_not_publish_partial_batch(tmp_path):
    action, progress = prepare_separate(tmp_path, [{
        "id": "E001",
        "name": "按钮",
        "type": "button",
        "bbox": [10, 10, 40, 20],
        "parent": None,
    }])
    batch = progress["batches"][0]
    assert batch["group"] != "background"
    fills = {index: "content" for index, slot in enumerate(batch["slots"]) if not slot.get("reserve")}
    paint(batch, fills).save(tmp_path / "assets/sheet.png")
    assert run(tmp_path, "record", "--name", "inventory", "--action-id", action["id"], "--file", "assets/sheet.png").returncode == 0
    before = (tmp_path / "assets/image/ui-split/inventory/bindings.json").read_text()
    redo = json.loads(run(tmp_path, "next", "--name", "inventory", "--redo-batch", "0", "--confirm-new-generation").stdout)["action"]
    bad = dict(fills)
    required = [index for index, slot in enumerate(batch["slots"]) if not slot.get("reserve")]
    bad[required[-1]] = "opaque"
    paint(batch, bad).save(tmp_path / "assets/bad.png")
    failed = run(tmp_path, "record", "--name", "inventory", "--action-id", redo["id"], "--file", "assets/bad.png")
    assert failed.returncode != 0
    assert (tmp_path / "assets/image/ui-split/inventory/bindings.json").read_text() == before
    progress = json.loads((tmp_path / "docs/.ui-split/inventory.json").read_text())
    assert all("-g1.png" not in entry["path"] for entry in progress["bindings"])
    assert not list((tmp_path / "assets/image/ui-split/inventory").glob("*-g1.png"))


def test_rejected_initial_batch_can_retry_without_skipping_later_batches(tmp_path):
    action, progress = prepare_separate(tmp_path, [
        {"id": "E001", "name": "按钮", "type": "button", "bbox": [10, 10, 40, 20], "parent": None},
        {"id": "E002", "name": "图标", "type": "icon", "bbox": [60, 60, 20, 20], "parent": None},
    ])
    assert len(progress["batches"]) > 1
    redo = ("--redo-batch", "0", "--confirm-new-generation")
    assert run(tmp_path, "next", "--name", "inventory", *redo).returncode != 0
    assert call(tmp_path, "next")["action"]["kind"] == "unknown"

    batch = progress["batches"][0]
    fills = {index: "content" for index, slot in enumerate(batch["slots"]) if not slot.get("reserve")}
    bad = {index: "empty" for index in fills}
    paint(batch, bad).save(tmp_path / "assets/bad.png")
    failed = run(tmp_path, "record", "--name", "inventory", "--action-id", action["id"], "--file", "assets/bad.png")
    assert "A required slot is empty" in failed.stderr
    assert call(tmp_path, "next")["action"]["kind"] == "rejected"
    assert run(tmp_path, "next", "--name", "inventory", "--redo-batch", "0").returncode != 0
    assert run(tmp_path, "next", "--name", "inventory", "--redo-batch", "1", "--confirm-new-generation").returncode != 0

    retry = call(tmp_path, "next", *redo)["action"]
    assert retry["id"] != action["id"]
    paint(batch, fills).save(tmp_path / "assets/good.png")
    result = call(tmp_path, "record", "--action-id", retry["id"], "--file", "assets/good.png")
    assert result["phase"] == "separate"
    assert call(tmp_path, "next")["action"]["tool"] == "edit_image"


def test_assemble_uses_shared_assembler_and_refuses_existing_output(tmp_path):
    action, progress = prepare_separate(
        tmp_path,
        [
            {
                "id": "E001",
                "name": "按钮",
                "type": "button",
                "bbox": [10, 10, 40, 20],
                "parent": None,
            }
        ],
        texts=[
            {
                "id": "T001",
                "text": "确定",
                "bbox": [16, 14, 24, 12],
                "parentId": "E001",
                "role": "button",
                "align": "center",
                "color": "#ffffff",
                "bold": False,
                "cutout": False,
            }
        ],
    )
    batch = progress["batches"][0]
    fills = {
        index: "content"
        for index, slot in enumerate(batch["slots"])
        if not slot.get("reserve")
    }
    paint(batch, fills).save(tmp_path / "assets/sheet.png")
    call(tmp_path, "record", "--action-id", action["id"], "--file", "assets/sheet.png")
    early = run(
        tmp_path,
        "assemble",
        "--name",
        "inventory",
        "--screen-key",
        "inventory",
        "--screen-name",
        "背包",
    )
    assert early.returncode != 0
    assert "Assemble after review is approved" in early.stderr

    call(tmp_path, "approve")
    result = call(
        tmp_path, "assemble", "--screen-key", "inventory", "--screen-name", "背包"
    )
    assert result["summary"]["screen"] == {"name": "背包", "key": "inventory"}
    document = json.loads(
        (tmp_path / "assets/ui/inventory/inventory.ui.json").read_text()
    )
    labels = []

    def walk(node):
        if node.get("type") == "Label":
            labels.append(node)
        for child in node.get("children", []):
            walk(child)

    walk(document)
    assert len(labels) == 1, "recognized text must survive assembly"
    label = labels[0]
    assert label["text"] == "确定"
    # Font size comes from the box, not from the agent: floor(min(12/1 line, 24/2 chars)).
    assert label["fontSize"] == 12
    # Placement stays inside the bound button, expressed relative to it.
    assert (label["left"], label["top"]) == (6, 4)
    assert (label["width"], label["height"]) == (24, 12)
    image = next(child for child in document["children"] if child.get("id") == "E001")
    assert image["width"] == 40 and image["height"] == 20
    assert (tmp_path / "assets/ui/inventory/inventory.reference.png").is_file()

    again = run(
        tmp_path,
        "assemble",
        "--name",
        "inventory",
        "--screen-key",
        "inventory",
        "--screen-name",
        "背包",
    )
    assert "already exists" in again.stderr


def test_assemble_refuses_output_crossing_a_symlink(tmp_path):
    action, progress = prepare_separate(
        tmp_path,
        [
            {
                "id": "E001",
                "name": "按钮",
                "type": "button",
                "bbox": [10, 10, 40, 20],
                "parent": None,
            }
        ],
    )
    batch = progress["batches"][0]
    fills = {
        index: "content"
        for index, slot in enumerate(batch["slots"])
        if not slot.get("reserve")
    }
    paint(batch, fills).save(tmp_path / "assets/sheet.png")
    call(tmp_path, "record", "--action-id", action["id"], "--file", "assets/sheet.png")
    call(tmp_path, "approve")
    outside = tmp_path.parent / (tmp_path.name + "-outside")
    outside.mkdir()
    (tmp_path / "assets/ui").symlink_to(outside, target_is_directory=True)
    result = run(
        tmp_path,
        "assemble",
        "--name",
        "inventory",
        "--screen-key",
        "inventory",
        "--screen-name",
        "背包",
    )
    assert result.returncode != 0
    assert "symlink" in result.stderr
    assert not list(outside.iterdir())


def approved_button_run(tmp_path, source="assets/design.png"):
    action, progress = prepare_separate(
        tmp_path,
        [
            {
                "id": "E001",
                "name": "按钮",
                "type": "button",
                "bbox": [10, 10, 40, 20],
                "parent": None,
            }
        ],
        source=source,
    )
    batch = progress["batches"][0]
    fills = {
        index: "content"
        for index, slot in enumerate(batch["slots"])
        if not slot.get("reserve")
    }
    paint(batch, fills).save(tmp_path / "assets/sheet.png")
    call(tmp_path, "record", "--action-id", action["id"], "--file", "assets/sheet.png")
    call(tmp_path, "approve")


def test_assemble_accepts_jpeg_original_without_rewriting_the_run(tmp_path):
    approved_button_run(tmp_path, source="assets/design.jpg")
    call(tmp_path, "assemble", "--screen-key", "inventory", "--screen-name", "背包")
    reference = tmp_path / "assets/ui/inventory/inventory.reference.png"
    with Image.open(reference) as image:
        assert image.format == "PNG"
        assert image.size == (100, 100)
    progress = json.loads((tmp_path / "docs/.ui-split/inventory.json").read_text())
    assert progress["design"]["path"] == "assets/design.jpg"
    assert progress["bbox"]["design"] == progress["design"]
    bbox = json.loads(
        (tmp_path / "assets/image/ui-split/inventory/bbox.json").read_text()
    )
    assert bbox["design"]["path"] == "assets/design.jpg"


def test_assemble_refuses_hand_edited_bbox_design(tmp_path):
    approved_button_run(tmp_path)
    path = tmp_path / "docs/.ui-split/inventory.json"
    progress = json.loads(path.read_text())
    progress["bbox"]["design"] = dict(progress["design"], path="assets/other.png")
    path.write_text(json.dumps(progress))
    result = run(
        tmp_path,
        "assemble",
        "--name",
        "inventory",
        "--screen-key",
        "inventory",
        "--screen-name",
        "背包",
    )
    assert result.returncode != 0
    assert "no longer matches" in result.stderr
    assert not (tmp_path / "assets/ui/inventory").exists()


def test_assemble_refuses_changed_original(tmp_path):
    approved_button_run(tmp_path)
    Image.new("RGB", (100, 100), "blue").save(tmp_path / "assets/design.png")
    result = run(
        tmp_path,
        "assemble",
        "--name",
        "inventory",
        "--screen-key",
        "inventory",
        "--screen-name",
        "背包",
    )
    assert result.returncode != 0
    assert "Original source changed" in result.stderr
    assert not (tmp_path / "assets/ui/inventory").exists()


def test_generated_png_is_not_bound_by_input_limits(tmp_path):
    import importlib.util
    import os
    import pytest

    spec = importlib.util.spec_from_file_location("ui_split_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    (tmp_path / "assets").mkdir()
    big = tmp_path / "assets/big.png"
    Image.frombytes("RGB", (2048, 2048), os.urandom(2048 * 2048 * 3)).save(big)
    assert big.stat().st_size > 10 * 1024 * 1024

    with pytest.raises(ValueError, match="10 MiB"):
        module.identity(tmp_path, "assets/big.png")

    descriptor = module.image_descriptor(tmp_path, big)
    assert descriptor["path"] == "assets/big.png"
    assert descriptor["width"] == 2048 and descriptor["height"] == 2048
    assert len(descriptor["sha256"]) == 64
