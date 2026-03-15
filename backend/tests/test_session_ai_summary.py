from meeting.session import SessionConfig


def test_session_config_defaults_include_ai_summary():
    cfg = SessionConfig()
    assert cfg.enable_ai_refine is True
    assert cfg.enable_ai_summary is True
    assert cfg.summary_interval == 120


def test_session_config_allows_ai_summary_override():
    cfg = SessionConfig(enable_ai_refine=False, enable_ai_summary=False, summary_interval=60)
    assert cfg.enable_ai_refine is False
    assert cfg.enable_ai_summary is False
    assert cfg.summary_interval == 60
