from app.main import make_srt, make_vtt, subtitle_timestamp


def test_subtitle_timestamp() -> None:
    assert subtitle_timestamp(65.432, ",") == "00:01:05,432"


def test_srt_export() -> None:
    result = make_srt([{"start": 0.0, "end": 1.5, "text": "Hola"}])
    assert "1\n00:00:00,000 --> 00:00:01,500\nHola" in result


def test_vtt_export() -> None:
    result = make_vtt([{"start": 0.0, "end": 1.5, "text": "Hola"}])
    assert result.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:01.500" in result
