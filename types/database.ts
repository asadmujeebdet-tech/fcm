export type MessageStatus = "draft"|"scheduled"|"sending"|"sent"|"partial_failure"|"failed"|"canceled";
export type TargetStatus = "pending" | "sent" | "failed";
export interface FirebaseApp { id:string; user_id:string; name:string; project_id:string; app_icon_url:string|null; topic:string; service_account_encrypted:string; encryption_iv:string; encryption_tag:string; is_active:boolean; created_at:string; updated_at:string; }
export type FirebaseAppPublic = Omit<FirebaseApp,"service_account_encrypted"|"encryption_iv"|"encryption_tag">;
export interface MessageApp { id:string; name:string; app_icon_url:string|null; }
export interface Message {
 id:string; user_id:string; topic:string;
 notification_title:string|null; notification_body:string|null; notification_image:string|null; analytics_label:string;
 status:MessageStatus; scheduled_at:string|null; sent_at:string|null;
 total_apps_targeted:number; total_sent:number; total_failed:number; sent_count:number; delivered:number; delivery_rate:number|null; delivery_failed:number;
 apps?:MessageApp[]; created_at:string; updated_at:string;
}
export interface MessageTarget { id:string; message_id:string; app_id:string|null; analytics_label:string|null; app_name:string|null; status:TargetStatus; fcm_message_id:string|null; error_message:string|null; sent_at:string|null; created_at:string; }
export interface MessageWithTargets extends Message { message_targets:(MessageTarget & {firebase_apps:{name:string;app_icon_url?:string|null}|null})[]; }