"""Shared outbound email content (the EazyReach cold-outreach campaign).

Plain-text body — sent via Brevo's textContent (html=False on send_message).

Personalization uses Brevo {{contact.FIRSTNAME}} / {{contact.COMPANY}} tags.
NOTE: Brevo fills these from the recipient's CONTACT attributes — they only
populate if the recipient exists as a Brevo contact with FIRSTNAME / COMPANY
set. The pipeline upserts the contact (with those attributes) right before
sending, so the tags resolve for cold prospects too.

Constant names are generic (CAMPAIGN_*) so the content can change without
renaming everywhere it's imported.
"""

CAMPAIGN_SUBJECT = (
    "We helped CareerFit run their phones with AI. We can do the same for you."
)

CAMPAIGN_TEXT = """Hi {{contact.FIRSTNAME}},

We recently built the outbound contact pipeline for CareerFit, helping their team find verified decision-makers and start conversations faster instead of burning hours on manual research.

Since {{contact.COMPANY}} is in the same space, the same setup would translate directly. EazyReach is an all-in-one B2B contact + outreach platform built for Indian sales teams:

- LinkedIn Profile Intelligence - reveal verified phone and email from any LinkedIn profile instantly, save to CRM in one click
- Bulk Search Enrichment - import hundreds of verified contacts straight from search results
- CXO Intel - DIN-verified executive contacts most global tools never index
- Direct Calling - browser-native click-to-call, no downloads
- AI Agent Calling - let AI run outbound with custom scripts per campaign
- MCP Server - connect Claude Desktop to live B2B data via natural language

Worth a look?

Best,
Joy
EazyReach | eazyreach.app"""
