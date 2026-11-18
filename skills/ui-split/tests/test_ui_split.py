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
