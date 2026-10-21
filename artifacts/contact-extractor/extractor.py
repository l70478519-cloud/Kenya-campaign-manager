"""
Pure data-mining logic for the Respondent Contact Extractor.

Kept free of any Streamlit imports so it can be unit-tested in isolation.
Handles locating, normalizing and validating respondent contact details
(names, Kenyan mobile numbers, emails, age, location) from a DataFrame.
"""

import re

import pandas as pd

# --------------------------------------------------------------------------- #
# Regex patterns
# --------------------------------------------------------------------------- #
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
EMAIL_FULL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

# Loose finder for anything that could be a phone number inside free text.
PHONE_CANDIDATE_RE = re.compile(r"\+?\d[\d\s\-\(\)]{7,}\d")

# A valid, complete Kenyan mobile number in international form.
VALID_INTL_RE = re.compile(r"^\+254[17]\d{8}$")

AGE_RE = re.compile(r"\b(1[01][0-9]|120|[1-9][0-9]?)\b")

HEADER_HINTS = {
    "name": ["full name", "fullname", "name", "respondent", "contact name",
             "person", "client", "voter"],
    "phone": ["phone number", "mobile number", "phone", "mobile", "cellphone",
              "cell", "msisdn", "telephone", "tel"],
    "email": ["email address", "e-mail", "email", "mail"],
    "age": ["age", "years"],
    "location": ["location", "region", "ward", "sub-county", "subcounty",
                 "county", "constituency", "town", "area", "village",
                 "estate", "address", "place"],
}


# --------------------------------------------------------------------------- #
# Normalization / cleaning helpers
# --------------------------------------------------------------------------- #
def clean_name(raw):
    """Return a properly capitalized full name, or None if not name-like."""
    if raw is None:
        return None
    s = str(raw).strip()
    s = re.sub(r"\s+", " ", s)
    if not s or not re.search(r"[A-Za-z]", s):
        return None
    if EMAIL_RE.search(s) or re.fullmatch(r"[\d\W]+", s):
        return None
    return re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), s)


def normalize_phone(raw):
    """Standardize a Kenyan phone number to +254######### international form."""
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return None
    if digits.startswith("254"):
        digits = digits[3:]
    if digits.startswith("0"):          # handles both 07... and 2540 7... forms
        digits = digits[1:]
    if len(digits) == 9 and digits[0] in "17":
        intl = "+254" + digits
        if VALID_INTL_RE.match(intl):
            return intl
    return None


def extract_phones(text):
    """Find and normalize every valid phone number in a block of text."""
    found = []
    for cand in PHONE_CANDIDATE_RE.findall(str(text)):
        norm = normalize_phone(cand)
        if norm and norm not in found:
            found.append(norm)
    return found


def to_local(intl):
    """Convert +254######### to local 0######### form."""
    if intl and intl.startswith("+254"):
        return "0" + intl[4:]
    return None


def extract_age(raw):
    if raw is None:
        return None
    m = AGE_RE.search(str(raw))
    if m:
        val = int(m.group(1))
        if 1 <= val <= 120:
            return val
    return None


def find_col(columns, keys):
    """Locate the best matching column for a set of header hints."""
    low = {c: str(c).strip().lower() for c in columns}
    for c in columns:
        if low[c] in keys:
            return c
    for k in keys:
        for c in columns:
            if k in low[c]:
                return c
    return None


def is_valid_email(value):
    return bool(value) and bool(EMAIL_FULL_RE.match(str(value)))


def is_valid_phone(value):
    return bool(value) and bool(VALID_INTL_RE.match(str(value)))


# --------------------------------------------------------------------------- #
# Core extraction
# --------------------------------------------------------------------------- #
def detect_columns(columns):
    return {
        "name": find_col(columns, HEADER_HINTS["name"]),
        "phone": find_col(columns, HEADER_HINTS["phone"]),
        "email": find_col(columns, HEADER_HINTS["email"]),
        "age": find_col(columns, HEADER_HINTS["age"]),
        "location": find_col(columns, HEADER_HINTS["location"]),
    }


def extract_contacts(df):
    """Return (clean_dataframe, detected_columns) mined from a raw DataFrame."""
    columns = list(df.columns)
    detected = detect_columns(columns)

    records = []
    for _, row in df.iterrows():
        row_text = " ".join("" if pd.isna(v) else str(v) for v in row.values)

        name = None
        if detected["name"] is not None and not pd.isna(row.get(detected["name"])):
            name = clean_name(row[detected["name"]])

        phone = None
        if detected["phone"] is not None and not pd.isna(row.get(detected["phone"])):
            phone = normalize_phone(row[detected["phone"]])
        if not phone:
            phones = extract_phones(row_text)
            phone = phones[0] if phones else None

        email = None
        if detected["email"] is not None and not pd.isna(row.get(detected["email"])):
            m = EMAIL_RE.search(str(row[detected["email"]]))
            email = m.group(0).lower() if m else None
        if not email:
            m = EMAIL_RE.search(row_text)
            email = m.group(0).lower() if m else None

        age = None
        if detected["age"] is not None and not pd.isna(row.get(detected["age"])):
            age = extract_age(row[detected["age"]])

        location = None
        if detected["location"] is not None and not pd.isna(row.get(detected["location"])):
            location = str(row[detected["location"]]).strip() or None

        records.append(
            {
                "Full Name": name,
                "Mobile (International)": phone,
                "Mobile (Local)": to_local(phone),
                "Email": email,
                "Age": age,
                "Location / Region": location,
            }
        )

    return pd.DataFrame(records), detected


def validate_and_filter(clean_df, require_phone=True, require_email=False,
                        require_name=False, dedupe=True):
    """Apply regex validation and the selected filters. Returns a new DataFrame."""
    df = clean_df.copy()
    df["_valid_phone"] = df["Mobile (International)"].apply(is_valid_phone)
    df["_valid_email"] = df["Email"].apply(is_valid_email)

    # Blank out invalid emails so they don't leak into the export
    df.loc[~df["_valid_email"], "Email"] = None

    mask = pd.Series(True, index=df.index)
    if require_phone:
        mask &= df["_valid_phone"]
    if require_email:
        mask &= df["_valid_email"]
    if require_name:
        mask &= df["Full Name"].notna()
    if not (require_phone or require_email or require_name):
        mask &= df["_valid_phone"] | df["_valid_email"]

    result = df[mask].copy()

    if dedupe and not result.empty:
        key = (
            result["Mobile (International)"]
            .fillna(result["Email"])
            .fillna(result["Full Name"])
        )
        result = result.assign(_dedupe_key=key)
        result = result.drop_duplicates(subset="_dedupe_key", keep="first")
        result = result.drop(columns="_dedupe_key")

    counts = {
        "valid_phones": int(df["_valid_phone"].sum()),
        "valid_emails": int(df["_valid_email"].sum()),
    }
    result = result.drop(columns=["_valid_phone", "_valid_email"])
    return result, counts
