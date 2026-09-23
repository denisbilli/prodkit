from tinyhttp import get


def test_get():
    assert get("https://example.com") == "https://example.com"
