"""
Respondent Contact Extractor
----------------------------
A Streamlit tool that mines respondent contact information (names, mobile
numbers, emails, age, location) out of raw polling data sheets uploaded as
CSV or Excel, normalizes and validates them with regular expressions, and
exports a clean contact list as CSV.
"""

from datetime import datetime

import pandas as pd
import streamlit as st

from extractor import extract_contacts, validate_and_filter

st.set_page_config(page_title="Respondent Contact Extractor", page_icon="📇",
                   layout="wide")

st.title("📇 Respondent Contact Extractor")
st.caption(
    "Upload a raw polling data sheet (CSV or Excel). The tool automatically "
    "locates, normalizes and validates respondent contact details, then lets "
    "you download a clean contact list."
)

st.warning(
    "**⚠️ Personally Identifiable Information (PII) Notice** — This tool "
    "processes sensitive personal data (names, phone numbers, emails). Handle, "
    "store and share the output strictly in compliance with applicable data "
    "protection laws (e.g. the Kenya Data Protection Act, 2019 / GDPR). Collect "
    "only what you are authorized to, keep it secure, and delete it when it is "
    "no longer needed.",
    icon="⚠️",
)

with st.sidebar:
    st.header("Extraction options")
    require_phone = st.checkbox("Require a valid mobile number", value=True)
    require_email = st.checkbox("Require a valid email", value=False)
    require_name = st.checkbox("Require a name", value=False)
    dedupe = st.checkbox("Remove duplicate contacts", value=True)
    st.divider()
    st.caption(
        "A row is kept only if it satisfies **all** the requirements you "
        "enable above. Deduplication uses the international mobile number "
        "(falling back to email, then name)."
    )

uploaded = st.file_uploader(
    "Upload polling data sheet",
    type=["csv", "xlsx", "xls"],
    accept_multiple_files=False,
)

if uploaded is None:
    st.info("👆 Upload a CSV or Excel file to begin.")
    st.stop()

# --- Read the file into a DataFrame ---
try:
    if uploaded.name.lower().endswith(".csv"):
        raw_df = pd.read_csv(uploaded, dtype=str, keep_default_na=False)
    else:
        xls = pd.ExcelFile(uploaded)
        sheet = xls.sheet_names[0]
        if len(xls.sheet_names) > 1:
            sheet = st.selectbox("Select a sheet", xls.sheet_names)
        raw_df = pd.read_excel(xls, sheet_name=sheet, dtype=str)
except Exception as exc:  # noqa: BLE001
    st.error(f"Could not read the file: {exc}")
    st.stop()

if raw_df.empty:
    st.error("The uploaded sheet has no rows.")
    st.stop()

st.subheader("1. Raw data preview")
st.caption(f"{len(raw_df):,} rows × {len(raw_df.columns)} columns")
st.dataframe(raw_df.head(20), use_container_width=True)

# --- Mine the contacts ---
clean_df, detected = extract_contacts(raw_df)

st.subheader("2. Detected source columns")
det_cols = st.columns(5)
labels = [
    ("Name", detected["name"]),
    ("Phone", detected["phone"]),
    ("Email", detected["email"]),
    ("Age", detected["age"]),
    ("Location", detected["location"]),
]
for col, (label, value) in zip(det_cols, labels):
    col.metric(label, value if value is not None else "— (scanned text)")

# --- Validate & filter ---
result, counts = validate_and_filter(
    clean_df,
    require_phone=require_phone,
    require_email=require_email,
    require_name=require_name,
    dedupe=dedupe,
)

# --- Metrics ---
st.subheader("3. Mining results")
m1, m2, m3, m4 = st.columns(4)
m1.metric("Rows scanned", f"{len(raw_df):,}")
m2.metric("Clean contacts", f"{len(result):,}")
m3.metric("Valid phones", f"{counts['valid_phones']:,}")
m4.metric("Valid emails", f"{counts['valid_emails']:,}")

if result.empty:
    st.error(
        "No contacts matched the current validation rules. Try relaxing the "
        "options in the sidebar."
    )
    st.stop()

st.dataframe(result, use_container_width=True)

# --- Export ---
st.subheader("4. Export")
csv_bytes = result.to_csv(index=False).encode("utf-8")
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
st.download_button(
    label="⬇️ Download cleaned contact list (CSV)",
    data=csv_bytes,
    file_name=f"cleaned_contacts_{stamp}.csv",
    mime="text/csv",
)
st.caption(
    "Reminder: the exported file contains PII. Store and transmit it securely."
)
