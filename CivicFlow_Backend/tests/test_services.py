from app.core.security import hash_password, verify_password
from app.schemas.incident import IncidentAnalysis
from app.services.ai_service import rules_based_analysis
from app.services.incident_ops import calculate_priority


def test_password_hash_verify_and_wrong_password():
    encoded = hash_password("a-long-test-password")
    assert encoded.startswith("scrypt$")
    assert verify_password("a-long-test-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_rules_detect_road_hazard_and_raise_priority():
    result = rules_based_analysis("A deep pothole near moving traffic is causing two-wheelers to swerve.")
    assert isinstance(result, IncidentAnalysis)
    assert result.category == "Road Damage"
    assert result.department == "Roads & Infrastructure"
    assert result.severity == "critical"
    assert result.safety_risk is True
    assert result.provider == "rules"
    assert 0 <= calculate_priority(result.severity, 30, result.safety_risk, result.summary) <= 100


def test_rules_detect_waste_and_mark_result_as_rules():
    result = rules_based_analysis("The garbage bin is overflowing beside the market walkway.")
    assert result.category == "Waste Overflow"
    assert result.department == "Waste Management"
    assert result.provider == "rules"
    assert result.warnings


def test_priority_is_bounded_and_explainable():
    low = calculate_priority("low", 1, False, "A small cosmetic issue in the park")
    high = calculate_priority("critical", 100000, True, "Hazard blocking road near moving traffic")
    assert 0 <= low <= 100
    assert 0 <= high <= 100
    assert high > low
