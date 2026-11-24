import json
from PIL import Image
from test_ui_split import call


def test_recognition_without_request_id_resubmits_same_key(tmp_path):
    (tmp_path / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(tmp_path / "assets/design.png")
    call(tmp_path, "init", "--source", "assets/design.png")
    edit = call(tmp_path, "next")["action"]
    call(tmp_path, "record", "--action-id", edit["id"], "--file", "assets/design.png")
    first = call(tmp_path, "next")["action"]
    assert first["action"] == "submit"
    retry = call(tmp_path, "next")["action"]
    first.pop("issued")
    assert retry == first
    assert "request_id" not in retry


def test_running_recognition_only_queries_original_request(tmp_path):
    (tmp_path / "assets").mkdir()
    Image.new("RGB", (100, 100), "red").save(tmp_path / "assets/design.png")
    call(tmp_path, "init", "--source", "assets/design.png")
    edit = call(tmp_path, "next")["action"]
    call(tmp_path, "record", "--action-id", edit["id"], "--file", "assets/design.png")
    recognize = call(tmp_path, "next")["action"]
    (tmp_path / "response.json").write_text(
        json.dumps({"status": "running", "request_id": "original-id"})
    )
    call(
        tmp_path,
        "record",
        "--action-id",
        recognize["id"],
        "--response",
        "response.json",
    )
    recovered = call(tmp_path, "next")["action"]
    assert recovered == {
        "id": recognize["id"],
        "tool": "recognize_ui",
        "action": "query",
        "request_id": "original-id",
    }
    assert "request_key" not in recovered
