"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session-cookie";
import { markAllNotificationsRead, openNotification } from "@/server/notifications/notification-service";
import { readString } from "./form-data";

/** Marks the notification read and follows its (internal) link. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const result = await openNotification(session.user.id, readString(formData, "notificationId"));
  revalidatePath("/", "layout");
  redirect(result?.link ?? "/notifications");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireSession();
  await markAllNotificationsRead(session.user.id);
  revalidatePath("/", "layout");
  redirect("/notifications?notice=all_read");
}
