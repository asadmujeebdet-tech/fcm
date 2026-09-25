import { NextRequest, NextResponse } from "next/server";
import * as admin from "firebase-admin";

export const runtime = "nodejs";

type CommonFields = {
  serviceAccount: string; // raw JSON string pasted by the user
  targetType: "token" | "topic";
  targetValue: string;
};

type NotificationBody = CommonFields & {
  format: "notification";
  title: string;
  body: string;
  imageUrl?: string;
};

type DataBody = CommonFields & {
  format: "data";
  appUrl: string;
  title: string;
  shortDesc: string;
  longDesc?: string;
  icon?: string;
  feature?: string;
};

type SendBody = NotificationBody | DataBody;

export async function POST(req: NextRequest) {
  let payload: SendBody;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { serviceAccount, targetType, targetValue } = payload;
  const format = payload.format ?? "notification";

  if (!serviceAccount || !targetType || !targetValue) {
    return NextResponse.json(
      { error: "serviceAccount, targetType and targetValue are all required" },
      { status: 400 }
    );
  }

  let message: admin.messaging.Message;

  if (format === "data") {
    const { appUrl, title, shortDesc, longDesc, icon, feature } = payload as DataBody;
    if (!appUrl || !title || !shortDesc) {
      return NextResponse.json(
        { error: "appUrl, title and shortDesc are required for the data format" },
        { status: 400 }
      );
    }

    // NOTE: this intentionally sends NO "notification" key. Your
    // MessageService.onMessageReceived() only reads remoteMessage.data, and
    // Android only guarantees onMessageReceived fires in every app state
    // (foreground/background/killed) for data-only messages. A payload that
    // also has a "notification" key gets shown by the system tray instead
    // when the app is backgrounded, and your custom RemoteViews code never
    // runs.
    message = {
      data: {
        app_url: appUrl,
        title,
        short_desc: shortDesc,
        long_desc_: longDesc ?? "",
        icon: icon ?? "",
        feature: feature ?? "",
      },
      ...(targetType === "token" ? { token: targetValue } : { topic: targetValue }),
    };
  } else {
    const { title, body, imageUrl } = payload as NotificationBody;
    if (!title || !body) {
      return NextResponse.json(
        { error: "title and body are required for the notification format" },
        { status: 400 }
      );
    }

    message = {
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      ...(targetType === "token" ? { token: targetValue } : { topic: targetValue }),
    };
  }

  let parsedServiceAccount: admin.ServiceAccount;
  try {
    parsedServiceAccount = JSON.parse(serviceAccount);
  } catch {
    return NextResponse.json(
      { error: "serviceAccount is not valid JSON. Paste the full service account file contents." },
      { status: 400 }
    );
  }

  // Give every request its own isolated, uniquely-named Firebase app so
  // concurrent requests (or repeated sends) never collide with each other
  // and so we never persist credentials between requests.
  const appName = `fcm-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let app: admin.app.App | undefined;

  try {
    app = admin.initializeApp(
      { credential: admin.credential.cert(parsedServiceAccount) },
      appName
    );

    const messageId = await admin.messaging(app).send(message);

    return NextResponse.json({ success: true, messageId });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? "Unknown error sending message" },
      { status: 500 }
    );
  } finally {
    // Always tear the temporary app down so credentials don't linger in memory.
    if (app) {
      await app.delete().catch(() => {});
    }
  }
}
