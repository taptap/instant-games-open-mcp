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


def prepare_separate(root, elements, name="inventory"):
    (root / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(root / "assets/design.png")
    result = run(root, "init", "--name", name, "--source", "assets/design.png")
    assert result.returncode == 0, result.stderr
    nxt = run(root, "next", "--name", name)
    assert nxt.returncode == 0, nxt.stderr
    action = json.loads(nxt.stdout)["action"]
    result = run(root, "record", "--name", name, "--action-id", action["id"], "--file", "assets/design.png")
    assert result.returncode == 0, result.stderr
    for phase, output in [
        ("cut", {"elements": elements}),
        ("text", {"texts": []}),
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
