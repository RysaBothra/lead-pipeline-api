"""Shared outbound email template (the EazyReach cold-outreach campaign).

Personalization uses Brevo {{contact.FIRSTNAME}} / {{contact.COMPANY}} tags.
NOTE: Brevo fills these from the recipient's CONTACT attributes — they only
populate if the recipient exists as a Brevo contact with FIRSTNAME / COMPANY
set. For cold prospects not yet in Brevo they render blank unless you upsert
the contact (POST /v3/contacts with those attributes) before sending.

Constant names are generic (CAMPAIGN_*) so the content can change without
renaming everywhere it's imported.
"""

CAMPAIGN_SUBJECT = (
    "We helped CareerFit run their phones with AI. We can do the same for you."
)

CAMPAIGN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:10px;">
          <tr>
            <td style="padding:32px 36px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.55; color:#222222;">

              <p style="margin:0 0 16px 0;">Hi {{contact.FIRSTNAME}},</p>

              <p style="margin:0 0 16px 0;">
                We recently built the outbound contact pipeline for CareerFit, helping their
                team find verified decision-makers and start conversations faster instead of
                burning hours on manual research.
              </p>

              <p style="margin:0 0 16px 0;">
                Since {{contact.COMPANY}} is in the same space, the same setup would translate
                directly. EazyReach is an all-in-one B2B contact + outreach platform built for
                Indian sales teams:
              </p>

              <ul style="margin:0 0 16px 0; padding-left:20px;">
                <li style="margin-bottom:9px;"><strong>LinkedIn Profile Intelligence</strong> &mdash; reveal verified phone and email from any LinkedIn profile instantly, save to CRM in one click</li>
                <li style="margin-bottom:9px;"><strong>Bulk Search Enrichment</strong> &mdash; import hundreds of verified contacts straight from search results</li>
                <li style="margin-bottom:9px;"><strong>CXO Intel</strong> &mdash; DIN-verified executive contacts most global tools never index</li>
                <li style="margin-bottom:9px;"><strong>Direct Calling</strong> &mdash; browser-native click-to-call, no downloads</li>
                <li style="margin-bottom:9px;"><strong>AI Agent Calling</strong> &mdash; let AI run outbound with custom scripts per campaign</li>
                <li style="margin-bottom:0;"><strong>MCP Server</strong> &mdash; connect Claude Desktop to live B2B data via natural language</li>
              </ul>

              <p style="margin:0 0 20px 0;">Worth a look?</p>

              <p style="margin:0; color:#222222;">
                Best,<br>
                Joy<br>
                <strong>EazyReach</strong> |
                <a href="https://eazyreach.app" style="color:#5B3DF5; text-decoration:none;">eazyreach.app</a>
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
