"""Self-contained unit tests for extractor.py. Run: python3 test_extractor.py"""

import pandas as pd

from extractor import (
    clean_name,
    detect_columns,
    extract_contacts,
    is_valid_email,
    normalize_phone,
    validate_and_filter,
)


def test_normalize_phone():
    cases = {
        "0712345678": "+254712345678",
        "254712345678": "+254712345678",
        "+254712345678": "+254712345678",
        "+254 712 345 678": "+254712345678",
        "254-712-345-678": "+254712345678",
        "0112345678": "+254112345678",
        "712345678": "+254712345678",
        "2540712345678": "+254712345678",   # 254 + 0 + subscriber
        "+2540712345678": "+254712345678",
        "0812345678": None,                  # 8xx not a valid KE mobile
        "12345": None,
        "": None,
        None: None,
    }
    for raw, expected in cases.items():
        assert normalize_phone(raw) == expected, (raw, normalize_phone(raw))


def test_clean_name():
    assert clean_name("  john   KAMAU mwangi ") == "John Kamau Mwangi"
    assert clean_name("o'brien wa-thiong'o") == "O'Brien Wa-Thiong'O"
    assert clean_name("123") is None
    assert clean_name("jane@example.com") is None
    assert clean_name("") is None


def test_email_validation():
    assert is_valid_email("a@b.com")
    assert not is_valid_email("nope@nope")
    assert not is_valid_email("")


def test_header_detection_no_collision():
    # "Contact Name" must NOT be picked as the phone column
    det = detect_columns(["Contact Name", "Mobile", "Email", "Age", "Ward"])
    assert det["name"] == "Contact Name"
    assert det["phone"] == "Mobile"
    assert det["email"] == "Email"


def test_end_to_end():
    raw = pd.DataFrame([
        {"Respondent Name": "jane  WANJIKU", "Mobile": "0722111333",
         "Email Address": "JANE@Example.com", "Age": "34", "Ward": "Ukia"},
        {"Respondent Name": "PETER m. otieno", "Mobile": "254733222444",
         "Email Address": "bad-email", "Age": "age 28", "Ward": "Ilima"},
        {"Respondent Name": "123", "Mobile": "999",
         "Email Address": "x@y.org", "Age": "x", "Ward": ""},
        {"Respondent Name": "jane  WANJIKU", "Mobile": "0722111333",
         "Email Address": "jane@example.com", "Age": "34", "Ward": "Ukia"},
    ])
    clean, det = extract_contacts(raw)
    assert det["phone"] == "Mobile"
    res, counts = validate_and_filter(clean, require_phone=True, dedupe=True)
    assert counts["valid_phones"] == 3
    assert len(res) == 2                       # invalid phone dropped, dup removed
    assert res.iloc[0]["Full Name"] == "Jane Wanjiku"
    assert res.iloc[0]["Mobile (International)"] == "+254722111333"
    assert pd.isna(res.iloc[1]["Email"])       # invalid email blanked


def test_freetext_fallback():
    raw = pd.DataFrame([
        {"notes": "Call Mary on 0700111222 or mary@site.co.ke re: turnout"},
    ])
    clean, _ = extract_contacts(raw)
    assert clean.iloc[0]["Mobile (International)"] == "+254700111222"
    assert clean.iloc[0]["Email"] == "mary@site.co.ke"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} tests passed.")
