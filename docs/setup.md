# Set up Q-Fill

Q-Fill talks to Gmail through a Google OAuth client that you own. You create it once in Google Cloud, which is free and takes about five minutes. After that you never touch it again.

You need a Google account and Chrome 116 or later (or another Chromium browser).

## 1. Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and choose the **`extension`** folder of this repository. Choose the folder itself, not the repository root.

A **Set up Q-Fill** tab opens. Keep it open: it shows your **redirect URI**, which looks like this:

```
https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/
```

The long part is your extension ID. If you close the tab, click the Q-Fill icon in the toolbar to see the same screen. You may need to pin Q-Fill first from the puzzle-piece menu.

## 2. Create a Google Cloud project

1. Go to [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate).
2. Name it `Q-Fill` and click **Create**.
3. Make sure the new project is selected in the project picker at the top of the page.

## 3. Turn on the Gmail API

1. Open [the Gmail API page](https://console.cloud.google.com/apis/library/gmail.googleapis.com).
2. Click **Enable**.

If you skip this, Q-Fill connects but then says "Gmail refused the request".

## 4. Configure the consent screen

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and click **Get started**.
2. **App information:** app name `Q-Fill`, and your own email as the support email.
3. **Audience:** choose **External**.
4. **Contact information:** your email.
5. Agree to the policy and click **Create**.
6. Open **Audience** in the left menu. Under **Test users**, click **Add users**, add the Gmail address you want Q-Fill to read, and save.

Leave the app in **Testing**. You do not need to publish it or send it for verification, because you are its only user.

## 5. Create the OAuth client

1. Open **Clients** in the left menu and click **Create client**.
2. **Application type:** choose **Web application**. Not "Chrome extension": that type only works with a different sign-in method that Edge and Brave do not support.
3. **Name:** `Q-Fill`.
4. Under **Authorized redirect URIs**, click **Add URI** and paste the redirect URI from step 1, including the `https://` and the trailing `/`.
5. Leave **Authorized JavaScript origins** empty.
6. Click **Create** and copy the **Client ID**. It ends in `.apps.googleusercontent.com`.

You do not need the client secret. Q-Fill never uses it.

## 6. Connect

1. Paste the client ID into Q-Fill and click **Save**.
2. Click **Connect Gmail**. A Google window opens and the Q-Fill popup closes, which is normal.
3. Pick your account.
4. Google warns that it has not verified the app. That is expected for your own app in testing: click **Continue**.
5. Allow **View your email messages and settings** and click **Continue**.

Open Q-Fill again. It shows your Gmail address and a **Fill code** button. You are done.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Google shows **Error 400: redirect_uri_mismatch** | The redirect URI in your OAuth client does not match the one in Q-Fill. Copy it again from Q-Fill's Settings and paste it exactly, trailing slash included. Changes can take a few minutes to apply. |
| Google shows **Error 403: access_denied** and "has not completed the Google verification process" | Add your Gmail address under **Audience**, then **Test users**. |
| Google shows **Error 401: invalid_client** | The client ID is wrong, or the client is not of type **Web application**. Check it in Settings, then **Change client ID**. |
| Q-Fill says "Gmail refused the request" | Turn on the Gmail API (step 3) in the same project as the OAuth client. |
| Q-Fill says to allow "View your email messages and settings" | You unticked that permission on the Google screen. Connect again and leave it ticked. |
| It worked, then stopped after you moved the folder | An unpacked extension's ID comes from its folder path, so moving the folder changes the redirect URI. Add the new URI from Settings to your OAuth client. |

## Disconnect or remove

- **Settings, then Disconnect Gmail** revokes the token at Google and clears everything Q-Fill keeps in memory.
- You can also remove Q-Fill's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Removing the extension from `chrome://extensions` deletes all of its stored data.
