/**
 * Hand-written emails for the extractor tests. They copy the shapes real
 * senders use (subject codes, codes in table cells, spaced digits, invisible
 * characters, other languages) without copying any real email.
 *
 * `expect` is the code that should be found, or null when the email has no
 * verification code and nothing should be filled.
 */

const wrap = inner => `<!doctype html><html><head><style>.c{font-size:32px}</style><title>Mail</title></head><body><table width="100%"><tr><td>${inner}</td></tr></table><p style="color:#999">© 2026 Example Inc, 100 Main Street, Springfield 62704. <a href="https://example.com/unsubscribe?id=99881234">Unsubscribe</a></p></body></html>`;

export const POSITIVE = [
  {
    name: 'plain sentence',
    subject: 'Your verification code',
    text: 'Your verification code is 482913. It expires in 10 minutes.',
    expect: '482913'
  },
  {
    name: 'code first, then label',
    subject: '482913 is your Acme code',
    text: 'Use 482913 to sign in to Acme. Don\'t share it with anyone.',
    expect: '482913'
  },
  {
    name: 'code alone in a styled table cell',
    subject: 'Confirm your email address',
    html: wrap('<h2>Confirm your email</h2><p>Enter this code in the open window:</p><div class="c" style="font-size:32px;letter-spacing:6px;font-weight:700">730154</div><p>This code expires in 15 minutes. If you did not request it, ignore this email.</p>'),
    expect: '730154'
  },
  {
    name: 'label on one line, code on the next',
    subject: 'Sign in to Example',
    text: 'Hi Sam,\n\nHere is your one-time code:\n\n591027\n\nIf you didn\'t try to sign in, change your password.',
    expect: '591027'
  },
  {
    name: 'spaced digits',
    subject: 'Your login code',
    text: 'Your login code is 123 456. Enter it on the sign-in page.',
    expect: '123456'
  },
  {
    name: 'dashed digits',
    subject: 'Security code',
    text: 'Use security code 804-221 to finish signing in.',
    expect: '804221'
  },
  {
    name: 'eight digits',
    subject: 'Verify your account',
    text: 'Your verification code: 40418822\nThe code is valid for 30 minutes.',
    expect: '40418822'
  },
  {
    name: 'four digits',
    subject: 'Your PIN',
    text: 'Your one-time PIN is 7741. Do not share this PIN.',
    expect: '7741'
  },
  {
    name: 'code in subject only',
    subject: 'Your Example code: 662190',
    text: 'Someone is trying to sign in to your Example account. If this was you, enter the code from the subject line.',
    expect: '662190'
  },
  {
    name: 'html with bold code',
    subject: 'Two-step verification',
    html: wrap('<p>Your two-step verification code is <b>319004</b>.</p><p>Need help? Call 1-800-555-0199.</p>'),
    expect: '319004'
  },
  {
    name: 'html only, entities and nbsp',
    subject: 'Verify&nbsp;your device',
    html: wrap('<p>Hello,</p><p>Use the following code to verify your new device:</p><p><strong>&#56;&#50;&#55;&#55;&#49;&#48;</strong></p><p>Thanks,<br>The Team</p>'),
    expect: '827710'
  },
  {
    name: 'invisible characters between digits',
    subject: 'Your verification code',
    text: 'Your code is 4​8‌2‍9⁠1﻿3.',
    expect: '482913'
  },
  {
    name: 'mixed letters and digits',
    subject: 'Confirm your sign-in',
    text: 'Enter this confirmation code: K7Q2ZP\nIt expires in 5 minutes.',
    expect: 'K7Q2ZP'
  },
  {
    name: 'dashed letters',
    subject: 'Confirmation code: XKD-PTQ',
    text: 'Your confirmation code is below. Enter it in your browser window and we\'ll help you get signed in.\n\nXKD-PTQ',
    expect: 'XKDPTQ'
  },
  {
    name: 'year and address in footer',
    subject: 'Your login code',
    html: wrap('<p>Your login code:</p><p style="font-size:28px">250817</p>'),
    expect: '250817'
  },
  {
    name: 'phone number in the email',
    subject: 'Verification code',
    text: 'Your verification code is 918273.\nQuestions? Call us at +1 (555) 012-3456 or 555 012 3456.',
    expect: '918273'
  },
  {
    name: 'order number and code in the same email',
    subject: 'Confirm your purchase',
    text: 'Order #84512379\nTo confirm this purchase, enter the security code 556102 on the checkout page.',
    expect: '556102'
  },
  {
    name: 'magic link plus code',
    subject: 'Sign in to Example',
    text: 'Click to sign in: https://example.com/login?token=99812345&code=11223344\n\nOr enter this code: 640218',
    expect: '640218'
  },
  {
    name: 'colon without space',
    subject: 'OTP',
    text: 'OTP:448210 valid for 3 mins.',
    expect: '448210'
  },
  {
    name: 'label after a greeting with a date',
    subject: 'Login attempt on Nov 7, 2026',
    text: 'We noticed a login attempt on November 7, 2026 at 10:42.\nYour authentication code is 302918.',
    expect: '302918'
  },
  {
    name: 'code for brand is',
    subject: 'Acme account',
    text: 'Your verification code for Acme Inc. is: 774201',
    expect: '774201'
  },
  {
    name: 'access code with expiry',
    subject: 'Your access code',
    text: 'Access code: 0938 (expires in 10 minutes)',
    expect: '0938'
  },
  {
    name: 'passcode in quotes',
    subject: 'One-time passcode',
    text: 'Please use the passcode "602153" to continue.',
    expect: '602153'
  },
  {
    name: 'temporary password numeric',
    subject: 'Temporary password',
    text: 'Your one-time password is 55128830.',
    expect: '55128830'
  },
  {
    name: 'many numbers, one labelled code',
    subject: 'Your bank verification',
    text: 'Account ending in 4421. Transaction of $1,250.00 on 11/07/2026.\nTo approve, enter verification code 810274.\nReference 99120044.',
    expect: '810274'
  },
  {
    name: 'expires in minutes before code',
    subject: 'Verify your email',
    text: 'This code expires in 10 minutes:\n\n382910',
    expect: '382910'
  },
  {
    name: 'Spanish',
    subject: 'Tu código de verificación',
    text: 'Tu código de verificación es 662013. Caduca en 10 minutos.',
    expect: '662013'
  },
  {
    name: 'Portuguese',
    subject: 'Código de acesso',
    text: 'Seu código é 305581.',
    expect: '305581'
  },
  {
    name: 'German compound word',
    subject: 'Ihr Bestätigungscode',
    text: 'Ihr Bestätigungscode lautet: 190455',
    expect: '190455'
  },
  {
    name: 'French',
    subject: 'Code de vérification',
    text: 'Votre code de vérification est 827364.',
    expect: '827364'
  },
  {
    name: 'Italian',
    subject: 'Codice di verifica',
    text: 'Il tuo codice di verifica è 451209.',
    expect: '451209'
  },
  {
    name: 'Polish',
    subject: 'Kod weryfikacyjny',
    text: 'Twój kod to 902114.',
    expect: '902114'
  },
  {
    name: 'Russian',
    subject: 'Код подтверждения',
    text: 'Ваш код подтверждения: 503921',
    expect: '503921'
  },
  {
    name: 'Japanese',
    subject: '認証コード',
    text: '認証コード：774512\nこのコードは10分間有効です。',
    expect: '774512'
  },
  {
    name: 'Chinese',
    subject: '验证码',
    text: '您的验证码为 663201，5分钟内有效。',
    expect: '663201'
  },
  {
    name: 'Korean',
    subject: '인증번호 안내',
    text: '인증번호: 448812',
    expect: '448812'
  },
  {
    name: 'html code in its own cell with no label nearby',
    subject: 'Verify your sign-in',
    html: wrap('<p>Someone signed in from a new browser. If this was you, enter the code below.</p><table><tr><td style="font-size:36px;font-family:monospace">915530</td></tr></table><p>Location: Springfield, 62704</p>'),
    expect: '915530'
  },
  {
    name: 'two codes, the labelled one wins',
    subject: 'Your verification code',
    text: 'Request ID 7712039\nYour verification code is 288133.',
    expect: '288133'
  },
  {
    name: 'code repeated in subject and body',
    subject: '913377 is your verification code',
    text: 'Your verification code is 913377',
    expect: '913377'
  },
  {
    name: 'sms style',
    subject: 'Message from Example',
    text: 'Example: 441209 is your verification code. Do not share it.',
    expect: '441209'
  },
  {
    name: 'mfa code with dash line',
    subject: 'MFA code',
    text: 'Your MFA code - 772013',
    expect: '772013'
  },
  {
    name: 'code with leading zero',
    subject: 'Login code',
    text: 'Login code: 004219',
    expect: '004219'
  },
  {
    name: 'html where text part is missing and code is in heading',
    subject: 'Complete your sign up',
    html: wrap('<p>Almost done. Paste this verification code into the sign up page:</p><h1>6 1 0 2 8 4</h1><h1>610284</h1>'),
    expect: '610284'
  },
  {
    name: 'plain text mail with year in the subject',
    subject: '2026 account security: verification code',
    text: 'Your code: 381102',
    expect: '381102'
  },
  {
    name: 'action phrase without the word code',
    subject: 'Sign in to Example',
    text: 'Use 222333 to sign in. Don\'t share it with anyone.',
    expect: '222333'
  },
  {
    name: 'code above a long paragraph',
    subject: 'Your sign-in code',
    text: '557104\n\nEnter this code to finish signing in. For your security, we will never ask you for this code by phone or by email. If you did not request a code, you can ignore this message.',
    expect: '557104'
  }
];

export const NEGATIVE = [
  {
    name: 'shipping notice with tracking number',
    subject: 'Your order has shipped',
    text: 'Order #10442290 has shipped. Tracking number 9400111899223. Estimated delivery Nov 10.',
    expect: null
  },
  {
    name: 'receipt with totals',
    subject: 'Your receipt from Example Store',
    text: 'Receipt 2041\nSubtotal $129.99\nTax $10.40\nTotal $140.39\nCard ending in 4421',
    expect: null
  },
  {
    name: 'promo code',
    subject: '20% off this weekend only',
    text: 'Use code SAVE20 at checkout for 20% off. Offer ends Sunday.',
    expect: null
  },
  {
    name: 'numeric promo code',
    subject: 'A gift for you',
    text: 'Use promo code 552211 for free shipping on orders over $50.',
    expect: null
  },
  {
    name: 'newsletter with a year',
    subject: 'The 2026 product roundup',
    text: 'Our favourite releases of 2026, plus 1500 new templates and a talk from our CEO.',
    expect: null
  },
  {
    name: 'calendar invite',
    subject: 'Invitation: Weekly sync @ Fri Nov 7, 2026 10:00 - 10:30',
    text: 'Join with Google Meet. Join by phone +1 555-012-3456 PIN: 882 113 004#',
    expect: null
  },
  {
    name: 'password reset link only',
    subject: 'Reset your password',
    text: 'We received a request to reset your password. Click the link below to choose a new one: https://example.com/reset?k=88123344. This link expires in 60 minutes.',
    expect: null
  },
  {
    name: 'flight booking reference',
    subject: 'Your flight booking',
    text: 'Booking code: ABC123\nFlight 2241 departs at 08:15 from gate 12.',
    expect: null
  },
  {
    name: 'zip code',
    subject: 'Update your address',
    text: 'Please confirm your zip code 90210 is still correct.',
    expect: null
  },
  {
    name: 'invoice',
    subject: 'Invoice 2026-1142 is ready',
    text: 'Invoice number 88213 for $3,400.00 is due on 12/01/2026.',
    expect: null
  },
  {
    name: 'social notification with counts',
    subject: 'You have 1250 new followers',
    text: 'Your post reached 15000 people and 2300 views this week.',
    expect: null
  },
  {
    name: 'gift card',
    subject: 'You received a gift card',
    text: 'Gift card number 6011 2233 4455. Redeem it at checkout.',
    expect: null
  },
  {
    name: 'support ticket',
    subject: 'Ticket 448812 updated',
    text: 'Your support ticket 448812 has a new reply from our team.',
    expect: null
  },
  {
    name: 'html newsletter with footer address',
    subject: 'This week at Example',
    html: wrap('<h1>New features</h1><p>We shipped 12 updates this week, including faster search.</p>'),
    expect: null
  },
  {
    name: 'meeting with dial-in',
    subject: 'Meeting details',
    text: 'Meeting ID: 845 2201 9934\nPasscode for dial-in is listed in the calendar.',
    expect: null
  },
  {
    name: 'referral code',
    subject: 'Invite friends',
    text: 'Share your referral code QX7P2M and get $10.',
    expect: null
  }
];
