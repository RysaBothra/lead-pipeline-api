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


# --- Follow-ups -------------------------------------------------------------
# Sent ONLY when manually triggered (POST /pipeline/followups with send=true),
# never automatically. Sequence per contact: initial -> follow-up 1 ->
# follow-up 2, each at least 4 days apart, then stop. Edit the copy freely;
# the subjects double as the sequence markers used to count prior sends, so if
# you change a subject after some sends have gone out, earlier sends won't be
# counted toward the cadence.

FOLLOWUP1_SUBJECT = "Following up — AI phones for {{contact.COMPANY}}"

FOLLOWUP1_TEXT = """Hi {{contact.FIRSTNAME}},

Floating my note back to the top of your inbox in case it got buried.

We set up the outbound contact + AI phone pipeline for CareerFit, and since {{contact.COMPANY}} is in the same space, the same setup would translate directly. Happy to show you what it looks like in 10 minutes.

Open to a quick look?

Best,
Joy
EazyReach | eazyreach.app"""

FOLLOWUP2_SUBJECT = "One last note"

FOLLOWUP2_TEXT = """Hi {{contact.FIRSTNAME}},

I'll keep this short — I don't want to clutter your inbox.

If finding verified decision-maker contacts and running outbound (including AI calling) is on your radar for {{contact.COMPANY}}, I'd love to help. If the timing isn't right, no worries at all and I won't follow up again.

Best,
Joy
EazyReach | eazyreach.app"""
