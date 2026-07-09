export const video_status = {
    uploading: "uploading",
    uploaded: "uploaded",
    processing: "processing",
    ready: "ready",
    failed: "failed",
    cancelled: "cancelled"
} as const;
export type video_status = (typeof video_status)[keyof typeof video_status];
export const video_stage = {
    transcoding: "transcoding",
    transcribing: "transcribing",
    packaging: "packaging",
    uploading_output: "uploading_output"
} as const;
export type video_stage = (typeof video_stage)[keyof typeof video_stage];
export const protection_mode = {
    none: "none",
    aes_128: "aes_128",
    drm_cbcs: "drm_cbcs"
} as const;
export type protection_mode = (typeof protection_mode)[keyof typeof protection_mode];
export const watermark_mode = {
    none: "none",
    dynamic_overlay: "dynamic_overlay",
    forensic_ab: "forensic_ab"
} as const;
export type watermark_mode = (typeof watermark_mode)[keyof typeof watermark_mode];
export const orientation = {
    landscape: "landscape",
    portrait: "portrait",
    square: "square"
} as const;
export type orientation = (typeof orientation)[keyof typeof orientation];
export const key_wrap_scheme = {
    kms: "kms",
    local_aes: "local_aes"
} as const;
export type key_wrap_scheme = (typeof key_wrap_scheme)[keyof typeof key_wrap_scheme];
export const video_artifact_status = {
    pending: "pending",
    processing: "processing",
    ready: "ready",
    failed: "failed",
    skipped: "skipped"
} as const;
export type video_artifact_status = (typeof video_artifact_status)[keyof typeof video_artifact_status];
export const video_job_kind = {
    CAPTIONS: "CAPTIONS",
    DOWNLOAD: "DOWNLOAD"
} as const;
export type video_job_kind = (typeof video_job_kind)[keyof typeof video_job_kind];
export const video_job_status = {
    queued: "queued",
    processing: "processing",
    done: "done",
    failed: "failed",
    cancelled: "cancelled"
} as const;
export type video_job_status = (typeof video_job_status)[keyof typeof video_job_status];
export const tenant_video_provider = {
    VDOCIPHER: "VDOCIPHER",
    EURON_VOD: "EURON_VOD"
} as const;
export type tenant_video_provider = (typeof tenant_video_provider)[keyof typeof tenant_video_provider];
export const addon_subscription_status = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    PAST_DUE: "PAST_DUE",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED"
} as const;
export type addon_subscription_status = (typeof addon_subscription_status)[keyof typeof addon_subscription_status];
export const admin_user_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DEACTIVATED: "DEACTIVATED"
} as const;
export type admin_user_status = (typeof admin_user_status)[keyof typeof admin_user_status];
export const affiliate_commission_status = {
    PENDING: "PENDING",
    COMPLETED: "COMPLETED",
    REVERSED: "REVERSED"
} as const;
export type affiliate_commission_status = (typeof affiliate_commission_status)[keyof typeof affiliate_commission_status];
export const affiliate_withdrawal_status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
} as const;
export type affiliate_withdrawal_status = (typeof affiliate_withdrawal_status)[keyof typeof affiliate_withdrawal_status];
export const ai_assistant_role = {
    user: "user",
    assistant: "assistant"
} as const;
export type ai_assistant_role = (typeof ai_assistant_role)[keyof typeof ai_assistant_role];
export const approval_workflow_type = {
    SINGLE: "SINGLE",
    TWO_LEVEL: "TWO_LEVEL",
    FINANCE_ONLY: "FINANCE_ONLY"
} as const;
export type approval_workflow_type = (typeof approval_workflow_type)[keyof typeof approval_workflow_type];
export const assignment_content_type = {
    TEXT: "TEXT",
    PDF: "PDF"
} as const;
export type assignment_content_type = (typeof assignment_content_type)[keyof typeof assignment_content_type];
export const assignment_scope = {
    COURSE: "COURSE",
    SECTION: "SECTION",
    LESSON: "LESSON"
} as const;
export type assignment_scope = (typeof assignment_scope)[keyof typeof assignment_scope];
export const assignment_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED"
} as const;
export type assignment_status = (typeof assignment_status)[keyof typeof assignment_status];
export const avani_interview_source = {
    RESUME: "RESUME",
    JOB_DESCRIPTION: "JOB_DESCRIPTION"
} as const;
export type avani_interview_source = (typeof avani_interview_source)[keyof typeof avani_interview_source];
export const avani_interview_status = {
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    ABANDONED: "ABANDONED"
} as const;
export type avani_interview_status = (typeof avani_interview_status)[keyof typeof avani_interview_status];
export const batch_item_type = {
    COURSE: "COURSE",
    BOOK: "BOOK"
} as const;
export type batch_item_type = (typeof batch_item_type)[keyof typeof batch_item_type];
export const batch_session_schedule_status = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    CANCELLED: "CANCELLED"
} as const;
export type batch_session_schedule_status = (typeof batch_session_schedule_status)[keyof typeof batch_session_schedule_status];
export const batch_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type batch_status = (typeof batch_status)[keyof typeof batch_status];
export const billing_cycle = {
    MONTHLY: "MONTHLY",
    YEARLY: "YEARLY",
    TWO_YEARLY: "TWO_YEARLY"
} as const;
export type billing_cycle = (typeof billing_cycle)[keyof typeof billing_cycle];
export const blog_author_type = {
    ADMIN: "ADMIN",
    USER: "USER"
} as const;
export type blog_author_type = (typeof blog_author_type)[keyof typeof blog_author_type];
export const blog_publish_status = {
    PUBLISHED: "PUBLISHED",
    NOT_PUBLISHED: "NOT_PUBLISHED"
} as const;
export type blog_publish_status = (typeof blog_publish_status)[keyof typeof blog_publish_status];
export const blog_section = {
    HERO: "HERO",
    FEATURED: "FEATURED",
    TRENDING: "TRENDING",
    LATEST: "LATEST",
    CATEGORY_FEATURED: "CATEGORY_FEATURED"
} as const;
export type blog_section = (typeof blog_section)[keyof typeof blog_section];
export const book_conversion_status = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
} as const;
export type book_conversion_status = (typeof book_conversion_status)[keyof typeof book_conversion_status];
export const book_file_format = {
    EPUB: "EPUB",
    PDF: "PDF"
} as const;
export type book_file_format = (typeof book_file_format)[keyof typeof book_file_format];
export const book_source_type = {
    PDF: "PDF"
} as const;
export type book_source_type = (typeof book_source_type)[keyof typeof book_source_type];
export const book_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type book_status = (typeof book_status)[keyof typeof book_status];
export const bookmark_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    PRODUCT_HUB_ITEM: "PRODUCT_HUB_ITEM"
} as const;
export type bookmark_type = (typeof bookmark_type)[keyof typeof bookmark_type];
export const bundle_item_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    HUB_PRODUCT: "HUB_PRODUCT",
    BATCH: "BATCH",
    TEST_SERIES: "TEST_SERIES"
} as const;
export type bundle_item_type = (typeof bundle_item_type)[keyof typeof bundle_item_type];
export const bundle_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type bundle_status = (typeof bundle_status)[keyof typeof bundle_status];
export const byte_cta_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    CUSTOM_URL: "CUSTOM_URL"
} as const;
export type byte_cta_type = (typeof byte_cta_type)[keyof typeof byte_cta_type];
export const byte_processing_status = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED"
} as const;
export type byte_processing_status = (typeof byte_processing_status)[keyof typeof byte_processing_status];
export const byte_reaction_type = {
    LIKE: "LIKE",
    DISLIKE: "DISLIKE"
} as const;
export type byte_reaction_type = (typeof byte_reaction_type)[keyof typeof byte_reaction_type];
export const byte_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type byte_status = (typeof byte_status)[keyof typeof byte_status];
export const campaign_audience_type = {
    ALL_MEMBERS: "ALL_MEMBERS",
    COURSE_ENROLLED: "COURSE_ENROLLED",
    BOOK_ACCESS: "BOOK_ACCESS",
    BUNDLE_ACCESS: "BUNDLE_ACCESS",
    SPECIFIC_MEMBERS: "SPECIFIC_MEMBERS"
} as const;
export type campaign_audience_type = (typeof campaign_audience_type)[keyof typeof campaign_audience_type];
export const campaign_channel = {
    YOUTUBE: "YOUTUBE",
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    TIKTOK: "TIKTOK",
    WHATSAPP: "WHATSAPP",
    TELEGRAM: "TELEGRAM",
    EMAIL: "EMAIL",
    BLOG: "BLOG",
    WEBSITE: "WEBSITE",
    PODCAST: "PODCAST",
    OTHER: "OTHER"
} as const;
export type campaign_channel = (typeof campaign_channel)[keyof typeof campaign_channel];
export const campaign_status = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED"
} as const;
export type campaign_status = (typeof campaign_status)[keyof typeof campaign_status];
export const cart_item_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    WEBINAR: "WEBINAR",
    PRODUCT_HUB_ITEM: "PRODUCT_HUB_ITEM",
    BATCH: "BATCH"
} as const;
export type cart_item_type = (typeof cart_item_type)[keyof typeof cart_item_type];
export const certificate_status = {
    ISSUED: "ISSUED",
    REVOKED: "REVOKED"
} as const;
export type certificate_status = (typeof certificate_status)[keyof typeof certificate_status];
export const code_problem_difficulty = {
    EASY: "EASY",
    MEDIUM: "MEDIUM",
    HARD: "HARD"
} as const;
export type code_problem_difficulty = (typeof code_problem_difficulty)[keyof typeof code_problem_difficulty];
export const code_problem_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type code_problem_status = (typeof code_problem_status)[keyof typeof code_problem_status];
export const code_submission_type = {
    RUN: "RUN",
    SUBMIT: "SUBMIT"
} as const;
export type code_submission_type = (typeof code_submission_type)[keyof typeof code_submission_type];
export const code_submission_verdict = {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    ACCEPTED: "ACCEPTED",
    WRONG_ANSWER: "WRONG_ANSWER",
    TIME_LIMIT_EXCEEDED: "TIME_LIMIT_EXCEEDED",
    MEMORY_LIMIT_EXCEEDED: "MEMORY_LIMIT_EXCEEDED",
    RUNTIME_ERROR: "RUNTIME_ERROR",
    COMPILATION_ERROR: "COMPILATION_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;
export type code_submission_verdict = (typeof code_submission_verdict)[keyof typeof code_submission_verdict];
export const community_attachment_type = {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    AUDIO: "AUDIO",
    PDF: "PDF",
    DOCUMENT: "DOCUMENT",
    CODE: "CODE",
    OTHER: "OTHER"
} as const;
export type community_attachment_type = (typeof community_attachment_type)[keyof typeof community_attachment_type];
export const community_event_registration_status = {
    REGISTERED: "REGISTERED",
    WAITLISTED: "WAITLISTED",
    CANCELLED: "CANCELLED",
    ATTENDED: "ATTENDED"
} as const;
export type community_event_registration_status = (typeof community_event_registration_status)[keyof typeof community_event_registration_status];
export const community_event_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED"
} as const;
export type community_event_status = (typeof community_event_status)[keyof typeof community_event_status];
export const community_feedback_status = {
    NEW: "NEW",
    REVIEWED: "REVIEWED",
    ARCHIVED: "ARCHIVED"
} as const;
export type community_feedback_status = (typeof community_feedback_status)[keyof typeof community_feedback_status];
export const community_member_status = {
    ACTIVE: "ACTIVE",
    PENDING: "PENDING",
    SUSPENDED: "SUSPENDED",
    LEFT: "LEFT"
} as const;
export type community_member_status = (typeof community_member_status)[keyof typeof community_member_status];
export const community_notification_type = {
    POST_REPLY: "POST_REPLY",
    COMMENT_REPLY: "COMMENT_REPLY",
    POST_UPVOTE: "POST_UPVOTE",
    COMMENT_UPVOTE: "COMMENT_UPVOTE",
    MENTION: "MENTION",
    MEMBERSHIP_APPROVED: "MEMBERSHIP_APPROVED",
    AUTO_JOINED: "AUTO_JOINED",
    DM_RECEIVED: "DM_RECEIVED",
    DM_MENTION: "DM_MENTION"
} as const;
export type community_notification_type = (typeof community_notification_type)[keyof typeof community_notification_type];
export const community_post_status = {
    PUBLISHED: "PUBLISHED",
    DRAFT: "DRAFT",
    ARCHIVED: "ARCHIVED",
    DELETED: "DELETED"
} as const;
export type community_post_status = (typeof community_post_status)[keyof typeof community_post_status];
export const community_post_type = {
    DISCUSSION: "DISCUSSION",
    QUESTION: "QUESTION",
    ANNOUNCEMENT: "ANNOUNCEMENT"
} as const;
export type community_post_type = (typeof community_post_type)[keyof typeof community_post_type];
export const community_qa_status = {
    OPEN: "OPEN",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED"
} as const;
export type community_qa_status = (typeof community_qa_status)[keyof typeof community_qa_status];
export const community_reaction_type = {
    UPVOTE: "UPVOTE",
    DOWNVOTE: "DOWNVOTE"
} as const;
export type community_reaction_type = (typeof community_reaction_type)[keyof typeof community_reaction_type];
export const community_role = {
    MEMBER: "MEMBER",
    MODERATOR: "MODERATOR",
    ADMIN: "ADMIN"
} as const;
export type community_role = (typeof community_role)[keyof typeof community_role];
export const community_share_type = {
    INTERNAL: "INTERNAL",
    EXTERNAL: "EXTERNAL"
} as const;
export type community_share_type = (typeof community_share_type)[keyof typeof community_share_type];
export const community_type = {
    GENERAL: "GENERAL",
    COURSE: "COURSE",
    PLAN: "PLAN"
} as const;
export type community_type = (typeof community_type)[keyof typeof community_type];
export const constraint_type = {
    BOOLEAN: "BOOLEAN",
    COUNT: "COUNT",
    LIMIT: "LIMIT"
} as const;
export type constraint_type = (typeof constraint_type)[keyof typeof constraint_type];
export const coupon_discount_type = {
    PERCENTAGE: "PERCENTAGE",
    FIXED: "FIXED"
} as const;
export type coupon_discount_type = (typeof coupon_discount_type)[keyof typeof coupon_discount_type];
export const course_difficulty = {
    BEGINNER: "BEGINNER",
    INTERMEDIATE: "INTERMEDIATE",
    ADVANCED: "ADVANCED",
    NONE: "NONE"
} as const;
export type course_difficulty = (typeof course_difficulty)[keyof typeof course_difficulty];
export const course_mode = {
    SELF_PACED: "SELF_PACED",
    LIVE: "LIVE",
    HYBRID: "HYBRID"
} as const;
export type course_mode = (typeof course_mode)[keyof typeof course_mode];
export const course_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED",
    SUSPENDED: "SUSPENDED"
} as const;
export type course_status = (typeof course_status)[keyof typeof course_status];
export const course_type = {
    NORMAL: "NORMAL",
    PROJECT: "PROJECT",
    WEBINAR: "WEBINAR",
    SHORTS: "SHORTS"
} as const;
export type course_type = (typeof course_type)[keyof typeof course_type];
export const crm_activity_direction = {
    INBOUND: "INBOUND",
    OUTBOUND: "OUTBOUND",
    NONE: "NONE"
} as const;
export type crm_activity_direction = (typeof crm_activity_direction)[keyof typeof crm_activity_direction];
export const crm_activity_type = {
    CALL: "CALL",
    EMAIL: "EMAIL",
    MEETING: "MEETING",
    WHATSAPP: "WHATSAPP",
    NOTE: "NOTE"
} as const;
export type crm_activity_type = (typeof crm_activity_type)[keyof typeof crm_activity_type];
export const crm_campaign_audience_type = {
    ALL_CONTACTS: "ALL_CONTACTS",
    SEGMENT: "SEGMENT",
    TAG: "TAG",
    MANUAL: "MANUAL"
} as const;
export type crm_campaign_audience_type = (typeof crm_campaign_audience_type)[keyof typeof crm_campaign_audience_type];
export const crm_campaign_channel = {
    WHATSAPP: "WHATSAPP",
    EMAIL: "EMAIL",
    YOUTUBE: "YOUTUBE",
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    TWITTER: "TWITTER",
    LINKEDIN: "LINKEDIN",
    TIKTOK: "TIKTOK",
    TELEGRAM: "TELEGRAM",
    BLOG: "BLOG",
    WEBSITE: "WEBSITE",
    PODCAST: "PODCAST",
    OTHER: "OTHER"
} as const;
export type crm_campaign_channel = (typeof crm_campaign_channel)[keyof typeof crm_campaign_channel];
export const crm_campaign_recipient_status = {
    PENDING: "PENDING",
    SENT: "SENT",
    DELIVERED: "DELIVERED",
    READ: "READ",
    FAILED: "FAILED",
    SKIPPED: "SKIPPED"
} as const;
export type crm_campaign_recipient_status = (typeof crm_campaign_recipient_status)[keyof typeof crm_campaign_recipient_status];
export const crm_campaign_status = {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    QUEUED: "QUEUED",
    SENDING: "SENDING",
    SENT: "SENT",
    PARTIALLY_SENT: "PARTIALLY_SENT",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
} as const;
export type crm_campaign_status = (typeof crm_campaign_status)[keyof typeof crm_campaign_status];
export const crm_contact_source = {
    MANUAL: "MANUAL",
    SIGNUP: "SIGNUP",
    PURCHASE: "PURCHASE",
    IMPORT: "IMPORT",
    PUBLIC_FORM: "PUBLIC_FORM"
} as const;
export type crm_contact_source = (typeof crm_contact_source)[keyof typeof crm_contact_source];
export const crm_contact_status = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
} as const;
export type crm_contact_status = (typeof crm_contact_status)[keyof typeof crm_contact_status];
export const crm_deal_stage_type = {
    OPEN: "OPEN",
    WON: "WON",
    LOST: "LOST"
} as const;
export type crm_deal_stage_type = (typeof crm_deal_stage_type)[keyof typeof crm_deal_stage_type];
export const crm_deal_status = {
    OPEN: "OPEN",
    WON: "WON",
    LOST: "LOST"
} as const;
export type crm_deal_status = (typeof crm_deal_status)[keyof typeof crm_deal_status];
export const crm_subject_type = {
    CONTACT: "CONTACT",
    DEAL: "DEAL"
} as const;
export type crm_subject_type = (typeof crm_subject_type)[keyof typeof crm_subject_type];
export const crm_task_priority = {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH"
} as const;
export type crm_task_priority = (typeof crm_task_priority)[keyof typeof crm_task_priority];
export const crm_task_status = {
    OPEN: "OPEN",
    DONE: "DONE",
    CANCELLED: "CANCELLED"
} as const;
export type crm_task_status = (typeof crm_task_status)[keyof typeof crm_task_status];
export const crm_whatsapp_direction = {
    INBOUND: "INBOUND",
    OUTBOUND: "OUTBOUND"
} as const;
export type crm_whatsapp_direction = (typeof crm_whatsapp_direction)[keyof typeof crm_whatsapp_direction];
export const crm_whatsapp_message_status = {
    QUEUED: "QUEUED",
    SENT: "SENT",
    DELIVERED: "DELIVERED",
    READ: "READ",
    FAILED: "FAILED"
} as const;
export type crm_whatsapp_message_status = (typeof crm_whatsapp_message_status)[keyof typeof crm_whatsapp_message_status];
export const crm_whatsapp_message_type = {
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    DOCUMENT: "DOCUMENT",
    TEMPLATE: "TEMPLATE",
    MEDIA: "MEDIA"
} as const;
export type crm_whatsapp_message_type = (typeof crm_whatsapp_message_type)[keyof typeof crm_whatsapp_message_type];
export const discount_type = {
    NONE: "NONE",
    PERCENTAGE: "PERCENTAGE",
    FIXED: "FIXED"
} as const;
export type discount_type = (typeof discount_type)[keyof typeof discount_type];
export const domain_status = {
    PENDING_VERIFICATION: "PENDING_VERIFICATION",
    PENDING_SSL: "PENDING_SSL",
    ACTIVE: "ACTIVE",
    FAILED: "FAILED",
    REMOVING: "REMOVING",
    REDIRECT: "REDIRECT"
} as const;
export type domain_status = (typeof domain_status)[keyof typeof domain_status];
export const domain_type = {
    SUBDOMAIN: "SUBDOMAIN",
    CUSTOM: "CUSTOM"
} as const;
export type domain_type = (typeof domain_type)[keyof typeof domain_type];
export const email_campaign_status = {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    QUEUED: "QUEUED",
    SENDING: "SENDING",
    SENT: "SENT",
    PARTIALLY_SENT: "PARTIALLY_SENT",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
} as const;
export type email_campaign_status = (typeof email_campaign_status)[keyof typeof email_campaign_status];
export const email_message_category = {
    TRANSACTIONAL: "TRANSACTIONAL",
    NOTIFICATION: "NOTIFICATION",
    MARKETING: "MARKETING"
} as const;
export type email_message_category = (typeof email_message_category)[keyof typeof email_message_category];
export const email_message_status = {
    QUEUED: "QUEUED",
    SENT: "SENT",
    DELIVERED: "DELIVERED",
    BOUNCED: "BOUNCED",
    COMPLAINED: "COMPLAINED",
    REJECTED: "REJECTED",
    FAILED: "FAILED",
    SUPPRESSED: "SUPPRESSED",
    FROZEN: "FROZEN"
} as const;
export type email_message_status = (typeof email_message_status)[keyof typeof email_message_status];
export const email_reputation_event_trigger = {
    AUTO_BOUNCE: "AUTO_BOUNCE",
    AUTO_COMPLAINT: "AUTO_COMPLAINT",
    AUTO_RECOVERY: "AUTO_RECOVERY",
    ADMIN_OVERRIDE: "ADMIN_OVERRIDE",
    EMERGENCY_BRAKE: "EMERGENCY_BRAKE"
} as const;
export type email_reputation_event_trigger = (typeof email_reputation_event_trigger)[keyof typeof email_reputation_event_trigger];
export const email_sender_identity_status = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
} as const;
export type email_sender_identity_status = (typeof email_sender_identity_status)[keyof typeof email_sender_identity_status];
export const email_sending_domain_status = {
    PENDING: "PENDING",
    VERIFIED: "VERIFIED",
    FAILED: "FAILED",
    DISABLED: "DISABLED"
} as const;
export type email_sending_domain_status = (typeof email_sending_domain_status)[keyof typeof email_sending_domain_status];
export const email_sending_tenant_status = {
    ACTIVE: "ACTIVE",
    WARNING: "WARNING",
    THROTTLED: "THROTTLED",
    PAUSED: "PAUSED"
} as const;
export type email_sending_tenant_status = (typeof email_sending_tenant_status)[keyof typeof email_sending_tenant_status];
export const email_suppression_reason = {
    HARD_BOUNCE: "HARD_BOUNCE",
    COMPLAINT: "COMPLAINT",
    MANUAL_UNSUBSCRIBE: "MANUAL_UNSUBSCRIBE",
    ADMIN_BLOCK: "ADMIN_BLOCK",
    IMPORTED: "IMPORTED"
} as const;
export type email_suppression_reason = (typeof email_suppression_reason)[keyof typeof email_suppression_reason];
export const enrollment_source = {
    PURCHASED: "PURCHASED",
    FREE: "FREE",
    ADMIN_GRANT: "ADMIN_GRANT",
    BUNDLE: "BUNDLE",
    COUPON: "COUPON",
    SUBSCRIPTION: "SUBSCRIPTION",
    BATCH: "BATCH"
} as const;
export type enrollment_source = (typeof enrollment_source)[keyof typeof enrollment_source];
export const enrollment_status = {
    ACTIVE: "ACTIVE",
    COMPLETED: "COMPLETED",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED",
    SUSPENDED: "SUSPENDED"
} as const;
export type enrollment_status = (typeof enrollment_status)[keyof typeof enrollment_status];
export const entitlement_sources = {
    PLAN: "PLAN",
    ADMIN: "ADMIN",
    ADDON: "ADDON",
    PROMO: "PROMO"
} as const;
export type entitlement_sources = (typeof entitlement_sources)[keyof typeof entitlement_sources];
export const euri_chat_status = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
} as const;
export type euri_chat_status = (typeof euri_chat_status)[keyof typeof euri_chat_status];
export const euri_file_type = {
    IMAGE: "IMAGE",
    PDF: "PDF",
    DOCUMENT: "DOCUMENT",
    SPREADSHEET: "SPREADSHEET",
    TEXT: "TEXT",
    CODE: "CODE",
    CSV: "CSV",
    OTHER: "OTHER"
} as const;
export type euri_file_type = (typeof euri_file_type)[keyof typeof euri_file_type];
export const euri_message_mode = {
    REGULAR: "REGULAR",
    SEARCH: "SEARCH",
    IMAGE_GENERATION: "IMAGE_GENERATION"
} as const;
export type euri_message_mode = (typeof euri_message_mode)[keyof typeof euri_message_mode];
export const euri_message_sender = {
    USER: "USER",
    AI: "AI"
} as const;
export type euri_message_sender = (typeof euri_message_sender)[keyof typeof euri_message_sender];
export const euri_message_type = {
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    FILE: "FILE"
} as const;
export type euri_message_type = (typeof euri_message_type)[keyof typeof euri_message_type];
export const euri_usage_log_status = {
    SUCCESS: "SUCCESS",
    ERROR: "ERROR"
} as const;
export type euri_usage_log_status = (typeof euri_usage_log_status)[keyof typeof euri_usage_log_status];
export const euri_usage_log_type = {
    CHAT_COMPLETION: "CHAT_COMPLETION",
    IMAGE_GENERATION: "IMAGE_GENERATION",
    WEB_SEARCH: "WEB_SEARCH"
} as const;
export type euri_usage_log_type = (typeof euri_usage_log_type)[keyof typeof euri_usage_log_type];
export const expense_approval_action = {
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    RETURNED: "RETURNED"
} as const;
export type expense_approval_action = (typeof expense_approval_action)[keyof typeof expense_approval_action];
export const expense_status = {
    DRAFT: "DRAFT",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    PENDING_SECOND_APPROVAL: "PENDING_SECOND_APPROVAL",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    REIMBURSED: "REIMBURSED",
    CANCELLED: "CANCELLED"
} as const;
export type expense_status = (typeof expense_status)[keyof typeof expense_status];
export const gateway_connection_status = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DISCONNECTED: "DISCONNECTED"
} as const;
export type gateway_connection_status = (typeof gateway_connection_status)[keyof typeof gateway_connection_status];
export const gateway_mode = {
    SELF_MANAGED: "SELF_MANAGED",
    PLATFORM_MANAGED: "PLATFORM_MANAGED"
} as const;
export type gateway_mode = (typeof gateway_mode)[keyof typeof gateway_mode];
export const hrms_asset_status = {
    ACTIVE: "ACTIVE",
    RETURNED: "RETURNED",
    REVOKED: "REVOKED"
} as const;
export type hrms_asset_status = (typeof hrms_asset_status)[keyof typeof hrms_asset_status];
export const hrms_asset_type = {
    SOFTWARE_ACCOUNT: "SOFTWARE_ACCOUNT",
    HARDWARE: "HARDWARE",
    SUBSCRIPTION: "SUBSCRIPTION",
    LICENSE: "LICENSE",
    OTHER: "OTHER"
} as const;
export type hrms_asset_type = (typeof hrms_asset_type)[keyof typeof hrms_asset_type];
export const hrms_attendance_status = {
    PRESENT: "PRESENT",
    ABSENT: "ABSENT",
    HALF_DAY: "HALF_DAY",
    LATE: "LATE",
    ON_LEAVE: "ON_LEAVE",
    HOLIDAY: "HOLIDAY",
    WEEKEND: "WEEKEND"
} as const;
export type hrms_attendance_status = (typeof hrms_attendance_status)[keyof typeof hrms_attendance_status];
export const hrms_boarding_process_status = {
    NOT_STARTED: "NOT_STARTED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED"
} as const;
export type hrms_boarding_process_status = (typeof hrms_boarding_process_status)[keyof typeof hrms_boarding_process_status];
export const hrms_boarding_task_status = {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    SKIPPED: "SKIPPED"
} as const;
export type hrms_boarding_task_status = (typeof hrms_boarding_task_status)[keyof typeof hrms_boarding_task_status];
export const hrms_boarding_type = {
    ONBOARDING: "ONBOARDING",
    OFFBOARDING: "OFFBOARDING"
} as const;
export type hrms_boarding_type = (typeof hrms_boarding_type)[keyof typeof hrms_boarding_type];
export const hrms_document_status = {
    PENDING: "PENDING",
    UPLOADED: "UPLOADED",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED"
} as const;
export type hrms_document_status = (typeof hrms_document_status)[keyof typeof hrms_document_status];
export const hrms_document_type = {
    ID_PROOF: "ID_PROOF",
    PAN: "PAN",
    AADHAAR: "AADHAAR",
    DEGREE: "DEGREE",
    BANK_PROOF: "BANK_PROOF",
    EXPERIENCE_LETTER: "EXPERIENCE_LETTER",
    OFFER_LETTER: "OFFER_LETTER",
    OTHER: "OTHER"
} as const;
export type hrms_document_type = (typeof hrms_document_type)[keyof typeof hrms_document_type];
export const hrms_employee_status = {
    INVITED: "INVITED",
    DOCUMENTS_PENDING: "DOCUMENTS_PENDING",
    UNDER_REVIEW: "UNDER_REVIEW",
    VERIFIED: "VERIFIED",
    ONBOARDED: "ONBOARDED",
    ACTIVE: "ACTIVE",
    ON_NOTICE: "ON_NOTICE",
    TERMINATED: "TERMINATED"
} as const;
export type hrms_employee_status = (typeof hrms_employee_status)[keyof typeof hrms_employee_status];
export const hrms_exit_document_type = {
    RELIEVING: "RELIEVING",
    EXPERIENCE: "EXPERIENCE",
    SERVICE_CERTIFICATE: "SERVICE_CERTIFICATE",
    FNF_STATEMENT: "FNF_STATEMENT"
} as const;
export type hrms_exit_document_type = (typeof hrms_exit_document_type)[keyof typeof hrms_exit_document_type];
export const hrms_exit_settlement_status = {
    DRAFT: "DRAFT",
    COMPUTED: "COMPUTED",
    APPROVED: "APPROVED",
    PAID: "PAID"
} as const;
export type hrms_exit_settlement_status = (typeof hrms_exit_settlement_status)[keyof typeof hrms_exit_settlement_status];
export const hrms_exit_status = {
    DRAFT: "DRAFT",
    SUBMITTED: "SUBMITTED",
    APPROVED: "APPROVED",
    IN_PROGRESS: "IN_PROGRESS",
    CLEARED: "CLEARED",
    SETTLED: "SETTLED",
    COMPLETED: "COMPLETED",
    REJECTED: "REJECTED",
    WITHDRAWN: "WITHDRAWN"
} as const;
export type hrms_exit_status = (typeof hrms_exit_status)[keyof typeof hrms_exit_status];
export const hrms_exit_type = {
    RESIGNATION: "RESIGNATION",
    TERMINATION: "TERMINATION",
    END_OF_CONTRACT: "END_OF_CONTRACT",
    RETIREMENT: "RETIREMENT",
    ABSCONDING: "ABSCONDING",
    DEATH: "DEATH",
    MUTUAL_SEPARATION: "MUTUAL_SEPARATION",
    LAYOFF: "LAYOFF"
} as const;
export type hrms_exit_type = (typeof hrms_exit_type)[keyof typeof hrms_exit_type];
export const hrms_gender = {
    MALE: "MALE",
    FEMALE: "FEMALE",
    OTHER: "OTHER",
    PREFER_NOT_TO_SAY: "PREFER_NOT_TO_SAY"
} as const;
export type hrms_gender = (typeof hrms_gender)[keyof typeof hrms_gender];
export const hrms_leave_request_status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED"
} as const;
export type hrms_leave_request_status = (typeof hrms_leave_request_status)[keyof typeof hrms_leave_request_status];
export const hrms_offer_letter_status = {
    DRAFT: "DRAFT",
    SENT: "SENT",
    ACCEPTED: "ACCEPTED",
    DECLINED: "DECLINED",
    WITHDRAWN: "WITHDRAWN",
    EXPIRED: "EXPIRED"
} as const;
export type hrms_offer_letter_status = (typeof hrms_offer_letter_status)[keyof typeof hrms_offer_letter_status];
export const hrms_payroll_record_status = {
    PENDING: "PENDING",
    COMPUTED: "COMPUTED",
    APPROVED: "APPROVED",
    PAID: "PAID",
    ON_HOLD: "ON_HOLD"
} as const;
export type hrms_payroll_record_status = (typeof hrms_payroll_record_status)[keyof typeof hrms_payroll_record_status];
export const hrms_payroll_run_status = {
    DRAFT: "DRAFT",
    PROCESSING: "PROCESSING",
    COMPUTED: "COMPUTED",
    APPROVED: "APPROVED",
    PAID: "PAID",
    CANCELLED: "CANCELLED"
} as const;
export type hrms_payroll_run_status = (typeof hrms_payroll_run_status)[keyof typeof hrms_payroll_run_status];
export const hrms_salary_component_type = {
    EARNING: "EARNING",
    DEDUCTION: "DEDUCTION",
    EMPLOYER_CONTRIBUTION: "EMPLOYER_CONTRIBUTION"
} as const;
export type hrms_salary_component_type = (typeof hrms_salary_component_type)[keyof typeof hrms_salary_component_type];
export const hub_availability_day = {
    MONDAY: "MONDAY",
    TUESDAY: "TUESDAY",
    WEDNESDAY: "WEDNESDAY",
    THURSDAY: "THURSDAY",
    FRIDAY: "FRIDAY",
    SATURDAY: "SATURDAY",
    SUNDAY: "SUNDAY"
} as const;
export type hub_availability_day = (typeof hub_availability_day)[keyof typeof hub_availability_day];
export const hub_booking_status = {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
    RESCHEDULED: "RESCHEDULED"
} as const;
export type hub_booking_status = (typeof hub_booking_status)[keyof typeof hub_booking_status];
export const hub_delivery_mode = {
    VIDEO_CALL: "VIDEO_CALL",
    AUDIO_CALL: "AUDIO_CALL",
    IN_PERSON: "IN_PERSON",
    ASYNC: "ASYNC"
} as const;
export type hub_delivery_mode = (typeof hub_delivery_mode)[keyof typeof hub_delivery_mode];
export const hub_digital_file_type = {
    PDF: "PDF",
    EBOOK: "EBOOK",
    GUIDE: "GUIDE",
    RESOURCE: "RESOURCE",
    TEMPLATE: "TEMPLATE",
    OTHER: "OTHER"
} as const;
export type hub_digital_file_type = (typeof hub_digital_file_type)[keyof typeof hub_digital_file_type];
export const hub_dm_message_type = {
    TEXT: "TEXT",
    VOICE_NOTE: "VOICE_NOTE",
    VIDEO: "VIDEO",
    LOOM_LINK: "LOOM_LINK"
} as const;
export type hub_dm_message_type = (typeof hub_dm_message_type)[keyof typeof hub_dm_message_type];
export const hub_dm_sender_type = {
    BUYER: "BUYER",
    CREATOR: "CREATOR"
} as const;
export type hub_dm_sender_type = (typeof hub_dm_sender_type)[keyof typeof hub_dm_sender_type];
export const hub_dm_status = {
    PENDING: "PENDING",
    REPLIED: "REPLIED",
    EXPIRED: "EXPIRED",
    CLOSED: "CLOSED",
    OPEN: "OPEN"
} as const;
export type hub_dm_status = (typeof hub_dm_status)[keyof typeof hub_dm_status];
export const hub_meeting_provider = {
    BBB: "BBB",
    ZOOM: "ZOOM",
    GOOGLE_MEET: "GOOGLE_MEET",
    CUSTOM: "CUSTOM"
} as const;
export type hub_meeting_provider = (typeof hub_meeting_provider)[keyof typeof hub_meeting_provider];
export const hub_notification_type = {
    BOOKING_NEW: "BOOKING_NEW",
    BOOKING_CANCELLED: "BOOKING_CANCELLED",
    BOOKING_RESCHEDULED: "BOOKING_RESCHEDULED",
    BOOKING_COMPLETED: "BOOKING_COMPLETED",
    PURCHASE_NEW: "PURCHASE_NEW",
    DM_RECEIVED: "DM_RECEIVED",
    DM_EXPIRING: "DM_EXPIRING",
    REVIEW_NEW: "REVIEW_NEW",
    WORKSHOP_SCHEDULED: "WORKSHOP_SCHEDULED",
    WORKSHOP_CANCELLED: "WORKSHOP_CANCELLED",
    PAYOUT: "PAYOUT",
    SYSTEM: "SYSTEM",
    DM_NEW_MESSAGE: "DM_NEW_MESSAGE",
    DM_THREAD_CLOSED: "DM_THREAD_CLOSED"
} as const;
export type hub_notification_type = (typeof hub_notification_type)[keyof typeof hub_notification_type];
export const hub_product_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED",
    SUSPENDED: "SUSPENDED"
} as const;
export type hub_product_status = (typeof hub_product_status)[keyof typeof hub_product_status];
export const hub_product_type = {
    ONE_ON_ONE_CALL: "ONE_ON_ONE_CALL",
    WORKSHOP: "WORKSHOP",
    DIGITAL_PRODUCT: "DIGITAL_PRODUCT",
    PAID_VIDEO: "PAID_VIDEO",
    PRIORITY_DM: "PRIORITY_DM",
    PACKAGE: "PACKAGE"
} as const;
export type hub_product_type = (typeof hub_product_type)[keyof typeof hub_product_type];
export const internal_actor_type = {
    CORE_ADMIN: "CORE_ADMIN",
    TENANT_ADMIN: "TENANT_ADMIN",
    SYSTEM: "SYSTEM"
} as const;
export type internal_actor_type = (typeof internal_actor_type)[keyof typeof internal_actor_type];
export const inv_discount_type = {
    FLAT: "FLAT",
    PERCENTAGE: "PERCENTAGE"
} as const;
export type inv_discount_type = (typeof inv_discount_type)[keyof typeof inv_discount_type];
export const inv_invoice_status = {
    DRAFT: "DRAFT",
    SENT: "SENT",
    PAID: "PAID",
    OVERDUE: "OVERDUE",
    CANCELLED: "CANCELLED"
} as const;
export type inv_invoice_status = (typeof inv_invoice_status)[keyof typeof inv_invoice_status];
export const inv_payment_method = {
    BANK_TRANSFER: "BANK_TRANSFER",
    CHEQUE: "CHEQUE",
    CASH: "CASH",
    UPI: "UPI",
    CARD: "CARD",
    OTHER: "OTHER"
} as const;
export type inv_payment_method = (typeof inv_payment_method)[keyof typeof inv_payment_method];
export const inv_recurrence_frequency = {
    WEEKLY: "WEEKLY",
    MONTHLY: "MONTHLY",
    QUARTERLY: "QUARTERLY",
    ANNUALLY: "ANNUALLY"
} as const;
export type inv_recurrence_frequency = (typeof inv_recurrence_frequency)[keyof typeof inv_recurrence_frequency];
export const inv_recurring_status = {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED"
} as const;
export type inv_recurring_status = (typeof inv_recurring_status)[keyof typeof inv_recurring_status];
export const inv_tax_jurisdiction = {
    IN_GST: "IN_GST",
    EU_VAT: "EU_VAT",
    US_SALES_TAX: "US_SALES_TAX",
    NONE: "NONE"
} as const;
export type inv_tax_jurisdiction = (typeof inv_tax_jurisdiction)[keyof typeof inv_tax_jurisdiction];
export const invoice_status = {
    GENERATED: "GENERATED",
    VOIDED: "VOIDED"
} as const;
export type invoice_status = (typeof invoice_status)[keyof typeof invoice_status];
export const invoice_type = {
    PLAN_SUBSCRIPTION: "PLAN_SUBSCRIPTION",
    USER_PURCHASE: "USER_PURCHASE"
} as const;
export type invoice_type = (typeof invoice_type)[keyof typeof invoice_type];
export const job_posting_status = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
    EXPIRED: "EXPIRED"
} as const;
export type job_posting_status = (typeof job_posting_status)[keyof typeof job_posting_status];
export const language_ai_proficiency_level = {
    A1: "A1",
    A2: "A2",
    B1: "B1",
    B2: "B2",
    C1: "C1",
    C2: "C2"
} as const;
export type language_ai_proficiency_level = (typeof language_ai_proficiency_level)[keyof typeof language_ai_proficiency_level];
export const language_ai_session_status = {
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    ABANDONED: "ABANDONED"
} as const;
export type language_ai_session_status = (typeof language_ai_session_status)[keyof typeof language_ai_session_status];
export const lesson_resource_type = {
    PDF: "PDF",
    LINK: "LINK",
    TEXT: "TEXT",
    IMAGE: "IMAGE",
    GITHUB: "GITHUB"
} as const;
export type lesson_resource_type = (typeof lesson_resource_type)[keyof typeof lesson_resource_type];
export const lesson_type = {
    LECTURE: "LECTURE",
    QUIZ: "QUIZ",
    ASSIGNMENT: "ASSIGNMENT",
    PDF: "PDF",
    LINK: "LINK",
    TEXT: "TEXT",
    IMAGE: "IMAGE"
} as const;
export type lesson_type = (typeof lesson_type)[keyof typeof lesson_type];
export const linkable_content_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    WEBINAR: "WEBINAR",
    PRODUCT_HUB_ITEM: "PRODUCT_HUB_ITEM",
    TEST_SERIES: "TEST_SERIES",
    BATCH: "BATCH"
} as const;
export type linkable_content_type = (typeof linkable_content_type)[keyof typeof linkable_content_type];
export const live_quiz_status = {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    LIVE: "LIVE",
    ENDED: "ENDED"
} as const;
export type live_quiz_status = (typeof live_quiz_status)[keyof typeof live_quiz_status];
export const live_session_status = {
    SCHEDULED: "SCHEDULED",
    LIVE: "LIVE",
    ENDED: "ENDED",
    CANCELLED: "CANCELLED"
} as const;
export type live_session_status = (typeof live_session_status)[keyof typeof live_session_status];
export const member_ai_wallet_transaction_type = {
    CREDIT_TOPUP: "CREDIT_TOPUP",
    CREDIT_ADJUSTMENT: "CREDIT_ADJUSTMENT",
    DEBIT_USAGE: "DEBIT_USAGE",
    DEBIT_ADJUSTMENT: "DEBIT_ADJUSTMENT"
} as const;
export type member_ai_wallet_transaction_type = (typeof member_ai_wallet_transaction_type)[keyof typeof member_ai_wallet_transaction_type];
export const member_notification_type = {
    BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
    BOOKING_REMINDER: "BOOKING_REMINDER",
    BOOKING_CANCELLED: "BOOKING_CANCELLED",
    BOOKING_RESCHEDULED: "BOOKING_RESCHEDULED",
    PURCHASE_CONFIRMED: "PURCHASE_CONFIRMED",
    DM_REPLIED: "DM_REPLIED",
    ENROLLMENT_NEW: "ENROLLMENT_NEW",
    LESSON_PUBLISHED: "LESSON_PUBLISHED",
    ASSIGNMENT_GRADED: "ASSIGNMENT_GRADED",
    CERTIFICATE_AVAILABLE: "CERTIFICATE_AVAILABLE",
    SYSTEM: "SYSTEM",
    WORKSHOP_NEW_SESSION: "WORKSHOP_NEW_SESSION",
    DM_NEW_MESSAGE: "DM_NEW_MESSAGE",
    DM_THREAD_CLOSED: "DM_THREAD_CLOSED",
    CAMPAIGN: "CAMPAIGN"
} as const;
export type member_notification_type = (typeof member_notification_type)[keyof typeof member_notification_type];
export const member_payment_detail_type = {
    UPI: "UPI",
    BANK_TRANSFER: "BANK_TRANSFER",
    PAYPAL: "PAYPAL"
} as const;
export type member_payment_detail_type = (typeof member_payment_detail_type)[keyof typeof member_payment_detail_type];
export const member_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DEACTIVATED: "DEACTIVATED"
} as const;
export type member_status = (typeof member_status)[keyof typeof member_status];
export const member_wallet_transaction_type = {
    CREDIT_COMMISSION: "CREDIT_COMMISSION",
    DEBIT_WITHDRAWAL: "DEBIT_WITHDRAWAL",
    DEBIT_COMMISSION_REVERSAL: "DEBIT_COMMISSION_REVERSAL"
} as const;
export type member_wallet_transaction_type = (typeof member_wallet_transaction_type)[keyof typeof member_wallet_transaction_type];
export const notification_broadcast_status = {
    DRAFT: "DRAFT",
    SCHEDULED: "SCHEDULED",
    QUEUED: "QUEUED",
    SENDING: "SENDING",
    SENT: "SENT",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
} as const;
export type notification_broadcast_status = (typeof notification_broadcast_status)[keyof typeof notification_broadcast_status];
export const notification_broadcast_target_type = {
    ALL_MEMBERS: "ALL_MEMBERS",
    MEMBERS: "MEMBERS",
    COURSE_ENROLLED: "COURSE_ENROLLED",
    BUNDLE_ENROLLED: "BUNDLE_ENROLLED",
    BOOK_PURCHASED: "BOOK_PURCHASED"
} as const;
export type notification_broadcast_target_type = (typeof notification_broadcast_target_type)[keyof typeof notification_broadcast_target_type];
export const notification_channel = {
    EMAIL: "EMAIL",
    WHATSAPP: "WHATSAPP",
    IN_APP: "IN_APP"
} as const;
export type notification_channel = (typeof notification_channel)[keyof typeof notification_channel];
export const order_status = {
    CREATED: "CREATED",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAID: "PAID",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
    REFUND_INITIATED: "REFUND_INITIATED",
    REFUNDED: "REFUNDED",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED"
} as const;
export type order_status = (typeof order_status)[keyof typeof order_status];
export const order_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    CART: "CART",
    WEBINAR: "WEBINAR",
    PRODUCT_HUB_ITEM: "PRODUCT_HUB_ITEM",
    PRODUCT_HUB_PACKAGE: "PRODUCT_HUB_PACKAGE",
    WALLET_TOPUP: "WALLET_TOPUP",
    BATCH: "BATCH",
    TEST_SERIES: "TEST_SERIES"
} as const;
export type order_type = (typeof order_type)[keyof typeof order_type];
export const partner_benefit_status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    PROCESSED: "PROCESSED"
} as const;
export type partner_benefit_status = (typeof partner_benefit_status)[keyof typeof partner_benefit_status];
export const partner_lead_status = {
    NEW: "NEW",
    CONTACTED: "CONTACTED",
    QUALIFIED: "QUALIFIED",
    CONVERTED: "CONVERTED",
    LOST: "LOST"
} as const;
export type partner_lead_status = (typeof partner_lead_status)[keyof typeof partner_lead_status];
export const partner_lead_type = {
    CLICK: "CLICK",
    SIGNUP: "SIGNUP",
    TENANT_CREATED: "TENANT_CREATED",
    PLAN_PURCHASED: "PLAN_PURCHASED"
} as const;
export type partner_lead_type = (typeof partner_lead_type)[keyof typeof partner_lead_type];
export const partner_status = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE",
    SUSPENDED: "SUSPENDED"
} as const;
export type partner_status = (typeof partner_status)[keyof typeof partner_status];
export const payment_receipt_status = {
    DRAFT: "DRAFT",
    GENERATED: "GENERATED",
    SENT: "SENT",
    CANCELLED: "CANCELLED"
} as const;
export type payment_receipt_status = (typeof payment_receipt_status)[keyof typeof payment_receipt_status];
export const payment_webhook_status = {
    PENDING: "PENDING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED"
} as const;
export type payment_webhook_status = (typeof payment_webhook_status)[keyof typeof payment_webhook_status];
export const payout_settlement_mode = {
    SYSTEM: "SYSTEM",
    MANUAL: "MANUAL"
} as const;
export type payout_settlement_mode = (typeof payout_settlement_mode)[keyof typeof payout_settlement_mode];
export const payout_status = {
    REQUESTED: "REQUESTED",
    APPROVED: "APPROVED",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    REJECTED: "REJECTED",
    FAILED: "FAILED"
} as const;
export type payout_status = (typeof payout_status)[keyof typeof payout_status];
export const plan_type = {
    SINGLE_APP: "SINGLE_APP",
    BUNDLE: "BUNDLE",
    ENTERPRISE: "ENTERPRISE"
} as const;
export type plan_type = (typeof plan_type)[keyof typeof plan_type];
export const platform_blog_author_status = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
} as const;
export type platform_blog_author_status = (typeof platform_blog_author_status)[keyof typeof platform_blog_author_status];
export const platform_blog_comment_status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
} as const;
export type platform_blog_comment_status = (typeof platform_blog_comment_status)[keyof typeof platform_blog_comment_status];
export const platform_blog_post_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    UNPUBLISHED: "UNPUBLISHED",
    SCHEDULED: "SCHEDULED"
} as const;
export type platform_blog_post_status = (typeof platform_blog_post_status)[keyof typeof platform_blog_post_status];
export const platform_campaign_audience_type = {
    LEADS_FILTER: "LEADS_FILTER",
    SELECTED_LEADS: "SELECTED_LEADS",
    CSV_IMPORT: "CSV_IMPORT"
} as const;
export type platform_campaign_audience_type = (typeof platform_campaign_audience_type)[keyof typeof platform_campaign_audience_type];
export const platform_campaign_channel = {
    EMAIL: "EMAIL",
    WHATSAPP: "WHATSAPP"
} as const;
export type platform_campaign_channel = (typeof platform_campaign_channel)[keyof typeof platform_campaign_channel];
export const platform_campaign_recipient_status = {
    PENDING: "PENDING",
    SENT: "SENT",
    FAILED: "FAILED",
    SKIPPED: "SKIPPED"
} as const;
export type platform_campaign_recipient_status = (typeof platform_campaign_recipient_status)[keyof typeof platform_campaign_recipient_status];
export const platform_campaign_status = {
    DRAFT: "DRAFT",
    SENDING: "SENDING",
    SENT: "SENT",
    PARTIALLY_SENT: "PARTIALLY_SENT",
    FAILED: "FAILED"
} as const;
export type platform_campaign_status = (typeof platform_campaign_status)[keyof typeof platform_campaign_status];
export const platform_support_sender_type = {
    TENANT: "TENANT",
    EURON: "EURON"
} as const;
export type platform_support_sender_type = (typeof platform_support_sender_type)[keyof typeof platform_support_sender_type];
export const platform_support_ticket_status = {
    OPEN: "OPEN",
    AWAITING_EURON: "AWAITING_EURON",
    AWAITING_TENANT: "AWAITING_TENANT",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED"
} as const;
export type platform_support_ticket_status = (typeof platform_support_ticket_status)[keyof typeof platform_support_ticket_status];
export const platform_webinar_event_type = {
    WEBINAR: "WEBINAR",
    WORKSHOP: "WORKSHOP"
} as const;
export type platform_webinar_event_type = (typeof platform_webinar_event_type)[keyof typeof platform_webinar_event_type];
export const platform_webinar_meeting_provider = {
    GOOGLE_MEET: "GOOGLE_MEET",
    ZOOM: "ZOOM",
    LUMA: "LUMA",
    MICROSOFT_TEAMS: "MICROSOFT_TEAMS",
    OTHER: "OTHER"
} as const;
export type platform_webinar_meeting_provider = (typeof platform_webinar_meeting_provider)[keyof typeof platform_webinar_meeting_provider];
export const platform_webinar_notification_channel = {
    EMAIL: "EMAIL",
    WHATSAPP: "WHATSAPP",
    BOTH: "BOTH"
} as const;
export type platform_webinar_notification_channel = (typeof platform_webinar_notification_channel)[keyof typeof platform_webinar_notification_channel];
export const platform_webinar_notification_status = {
    PENDING: "PENDING",
    SCHEDULED: "SCHEDULED",
    SENT: "SENT",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
} as const;
export type platform_webinar_notification_status = (typeof platform_webinar_notification_status)[keyof typeof platform_webinar_notification_status];
export const platform_webinar_notification_type = {
    CONFIRMATION: "CONFIRMATION",
    REMINDER_24H: "REMINDER_24H",
    REMINDER_1H: "REMINDER_1H",
    REMINDER_30M: "REMINDER_30M",
    REMINDER_5M: "REMINDER_5M",
    CANCELLATION: "CANCELLATION",
    FOLLOWUP: "FOLLOWUP",
    CUSTOM: "CUSTOM"
} as const;
export type platform_webinar_notification_type = (typeof platform_webinar_notification_type)[keyof typeof platform_webinar_notification_type];
export const platform_webinar_registration_status = {
    REGISTERED: "REGISTERED",
    CANCELLED: "CANCELLED",
    ATTENDED: "ATTENDED",
    NO_SHOW: "NO_SHOW"
} as const;
export type platform_webinar_registration_status = (typeof platform_webinar_registration_status)[keyof typeof platform_webinar_registration_status];
export const platform_webinar_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED"
} as const;
export type platform_webinar_status = (typeof platform_webinar_status)[keyof typeof platform_webinar_status];
export const practice_session_status = {
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    ABANDONED: "ABANDONED"
} as const;
export type practice_session_status = (typeof practice_session_status)[keyof typeof practice_session_status];
export const price_entity_type = {
    COURSE: "COURSE",
    BOOK: "BOOK",
    BUNDLE: "BUNDLE",
    BATCH: "BATCH",
    WEBINAR: "WEBINAR",
    TEST_SERIES: "TEST_SERIES",
    HUB_PRODUCT: "HUB_PRODUCT"
} as const;
export type price_entity_type = (typeof price_entity_type)[keyof typeof price_entity_type];
export const pricing_frequency = {
    MONTHLY: "MONTHLY",
    YEARLY: "YEARLY",
    BOTH: "BOTH",
    TWO_YEARLY: "TWO_YEARLY",
    ALL: "ALL"
} as const;
export type pricing_frequency = (typeof pricing_frequency)[keyof typeof pricing_frequency];
export const purchase_mode = {
    FREE: "FREE",
    PAID: "PAID"
} as const;
export type purchase_mode = (typeof purchase_mode)[keyof typeof purchase_mode];
export const quiz_attempt_status = {
    IN_PROGRESS: "IN_PROGRESS",
    PASSED: "PASSED",
    FAILED: "FAILED"
} as const;
export type quiz_attempt_status = (typeof quiz_attempt_status)[keyof typeof quiz_attempt_status];
export const quiz_question_type = {
    MCQ: "MCQ",
    DRAG_DROP: "DRAG_DROP"
} as const;
export type quiz_question_type = (typeof quiz_question_type)[keyof typeof quiz_question_type];
export const quiz_scope = {
    COURSE: "COURSE",
    SECTION: "SECTION",
    LESSON: "LESSON"
} as const;
export type quiz_scope = (typeof quiz_scope)[keyof typeof quiz_scope];
export const quiz_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED"
} as const;
export type quiz_status = (typeof quiz_status)[keyof typeof quiz_status];
export const receipt_scan_status = {
    PENDING: "PENDING",
    CLEAN: "CLEAN",
    INFECTED: "INFECTED",
    FAILED: "FAILED"
} as const;
export type receipt_scan_status = (typeof receipt_scan_status)[keyof typeof receipt_scan_status];
export const refund_status = {
    INITIATED: "INITIATED",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
} as const;
export type refund_status = (typeof refund_status)[keyof typeof refund_status];
export const resource_status = {
    ACTIVE: "ACTIVE",
    INACTIVE: "INACTIVE"
} as const;
export type resource_status = (typeof resource_status)[keyof typeof resource_status];
export const resume_component_status = {
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED",
    NOT_ELIGIBLE: "NOT_ELIGIBLE"
} as const;
export type resume_component_status = (typeof resume_component_status)[keyof typeof resume_component_status];
export const resume_status = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    ANALYZED: "ANALYZED",
    ERROR: "ERROR"
} as const;
export type resume_status = (typeof resume_status)[keyof typeof resume_status];
export const roadmap_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type roadmap_status = (typeof roadmap_status)[keyof typeof roadmap_status];
export const sat_vocab_progress_status = {
    NEW: "NEW",
    LEARNING: "LEARNING",
    KNOWN: "KNOWN"
} as const;
export type sat_vocab_progress_status = (typeof sat_vocab_progress_status)[keyof typeof sat_vocab_progress_status];
export const staff_membership_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    INVITED: "INVITED"
} as const;
export type staff_membership_status = (typeof staff_membership_status)[keyof typeof staff_membership_status];
export const submission_content_type = {
    TEXT: "TEXT",
    PDF: "PDF"
} as const;
export type submission_content_type = (typeof submission_content_type)[keyof typeof submission_content_type];
export const submission_status = {
    PENDING: "PENDING",
    SUBMITTED: "SUBMITTED",
    UNDER_REVIEW: "UNDER_REVIEW",
    EVALUATED: "EVALUATED",
    RESUBMISSION_REQUESTED: "RESUBMISSION_REQUESTED"
} as const;
export type submission_status = (typeof submission_status)[keyof typeof submission_status];
export const subscription_status = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    PAST_DUE: "PAST_DUE",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    TRIALING: "TRIALING"
} as const;
export type subscription_status = (typeof subscription_status)[keyof typeof subscription_status];
export const support_ticket_priority = {
    LOW: "LOW",
    NORMAL: "NORMAL",
    HIGH: "HIGH",
    URGENT: "URGENT"
} as const;
export type support_ticket_priority = (typeof support_ticket_priority)[keyof typeof support_ticket_priority];
export const support_ticket_sender_type = {
    USER: "USER",
    TENANT: "TENANT",
    AI: "AI"
} as const;
export type support_ticket_sender_type = (typeof support_ticket_sender_type)[keyof typeof support_ticket_sender_type];
export const support_ticket_status = {
    OPEN: "OPEN",
    AI_REPLIED: "AI_REPLIED",
    AWAITING_TENANT: "AWAITING_TENANT",
    AWAITING_USER: "AWAITING_USER",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED"
} as const;
export type support_ticket_status = (typeof support_ticket_status)[keyof typeof support_ticket_status];
export const tax_mode = {
    INCLUSIVE: "INCLUSIVE",
    EXCLUSIVE: "EXCLUSIVE"
} as const;
export type tax_mode = (typeof tax_mode)[keyof typeof tax_mode];
export const tenant_addon_event_type = {
    PURCHASED: "PURCHASED",
    ADMIN_GRANTED_PAID: "ADMIN_GRANTED_PAID",
    ADMIN_GRANTED_FREE: "ADMIN_GRANTED_FREE",
    ACTIVATED: "ACTIVATED",
    SUSPENDED: "SUSPENDED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    RENEWED: "RENEWED",
    UPGRADED: "UPGRADED"
} as const;
export type tenant_addon_event_type = (typeof tenant_addon_event_type)[keyof typeof tenant_addon_event_type];
export const tenant_addon_source = {
    PURCHASED: "PURCHASED",
    ADMIN_PAID: "ADMIN_PAID",
    ADMIN_FREE: "ADMIN_FREE"
} as const;
export type tenant_addon_source = (typeof tenant_addon_source)[keyof typeof tenant_addon_source];
export const tenant_addon_status = {
    ACTIVE: "ACTIVE",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    SUSPENDED: "SUSPENDED"
} as const;
export type tenant_addon_status = (typeof tenant_addon_status)[keyof typeof tenant_addon_status];
export const tenant_app_event_type = {
    ACTIVATED: "ACTIVATED",
    SUSPENDED: "SUSPENDED",
    UNSUSPENDED: "UNSUSPENDED",
    TRIAL_STARTED: "TRIAL_STARTED",
    TRIAL_EXTENDED: "TRIAL_EXTENDED",
    TRIAL_EXPIRED: "TRIAL_EXPIRED",
    CANCELLED: "CANCELLED",
    REACTIVATED: "REACTIVATED"
} as const;
export type tenant_app_event_type = (typeof tenant_app_event_type)[keyof typeof tenant_app_event_type];
export const tenant_app_source = {
    SUBSCRIPTION: "SUBSCRIPTION",
    ADMIN_TRIAL: "ADMIN_TRIAL",
    ADMIN_GRANT: "ADMIN_GRANT",
    PROMO: "PROMO"
} as const;
export type tenant_app_source = (typeof tenant_app_source)[keyof typeof tenant_app_source];
export const tenant_app_status = {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    SUSPENDED: "SUSPENDED",
    CANCELLED: "CANCELLED"
} as const;
export type tenant_app_status = (typeof tenant_app_status)[keyof typeof tenant_app_status];
export const tenant_bulk_import_scope_type = {
    TENANT: "TENANT",
    COURSE: "COURSE",
    BOOK: "BOOK",
    BATCH: "BATCH",
    TEST_SERIES: "TEST_SERIES",
    WEBINAR: "WEBINAR",
    HUB_PRODUCT: "HUB_PRODUCT",
    BUNDLE: "BUNDLE"
} as const;
export type tenant_bulk_import_scope_type = (typeof tenant_bulk_import_scope_type)[keyof typeof tenant_bulk_import_scope_type];
export const tenant_bulk_import_source = {
    CSV: "CSV",
    SELECT_EXISTING: "SELECT_EXISTING"
} as const;
export type tenant_bulk_import_source = (typeof tenant_bulk_import_source)[keyof typeof tenant_bulk_import_source];
export const tenant_bulk_import_status = {
    QUEUED: "QUEUED",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
} as const;
export type tenant_bulk_import_status = (typeof tenant_bulk_import_status)[keyof typeof tenant_bulk_import_status];
export const tenant_member_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    LEFT: "LEFT",
    REMOVED: "REMOVED"
} as const;
export type tenant_member_status = (typeof tenant_member_status)[keyof typeof tenant_member_status];
export const tenant_payout_method_type = {
    BANK_TRANSFER: "BANK_TRANSFER",
    UPI: "UPI",
    PAYPAL: "PAYPAL",
    PAYONEER: "PAYONEER"
} as const;
export type tenant_payout_method_type = (typeof tenant_payout_method_type)[keyof typeof tenant_payout_method_type];
export const tenant_status = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    CANCELLED: "CANCELLED"
} as const;
export type tenant_status = (typeof tenant_status)[keyof typeof tenant_status];
export const tenant_subscription_status = {
    CREATED: "CREATED",
    AUTHENTICATED: "AUTHENTICATED",
    ACTIVE: "ACTIVE",
    PENDING: "PENDING",
    HALTED: "HALTED",
    PAUSED: "PAUSED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
    EXPIRED: "EXPIRED"
} as const;
export type tenant_subscription_status = (typeof tenant_subscription_status)[keyof typeof tenant_subscription_status];
export const tenant_user_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DEACTIVATED: "DEACTIVATED",
    INVITED: "INVITED"
} as const;
export type tenant_user_status = (typeof tenant_user_status)[keyof typeof tenant_user_status];
export const test_attempt_module_status = {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED"
} as const;
export type test_attempt_module_status = (typeof test_attempt_module_status)[keyof typeof test_attempt_module_status];
export const test_attempt_status = {
    IN_PROGRESS: "IN_PROGRESS",
    SUBMITTED: "SUBMITTED",
    AUTO_SUBMITTED: "AUTO_SUBMITTED",
    ON_BREAK: "ON_BREAK"
} as const;
export type test_attempt_status = (typeof test_attempt_status)[keyof typeof test_attempt_status];
export const test_mode = {
    STANDARD: "STANDARD",
    ADAPTIVE: "ADAPTIVE"
} as const;
export type test_mode = (typeof test_mode)[keyof typeof test_mode];
export const test_question_created_via = {
    MANUAL: "MANUAL",
    IMPORT: "IMPORT",
    AI: "AI"
} as const;
export type test_question_created_via = (typeof test_question_created_via)[keyof typeof test_question_created_via];
export const test_question_difficulty = {
    EASY: "EASY",
    MEDIUM: "MEDIUM",
    HARD: "HARD"
} as const;
export type test_question_difficulty = (typeof test_question_difficulty)[keyof typeof test_question_difficulty];
export const test_question_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type test_question_status = (typeof test_question_status)[keyof typeof test_question_status];
export const test_question_type = {
    MCQ_SINGLE: "MCQ_SINGLE",
    MCQ_MULTI: "MCQ_MULTI",
    TRUE_FALSE: "TRUE_FALSE",
    FIB: "FIB",
    NAT: "NAT",
    DRAG_DROP: "DRAG_DROP"
} as const;
export type test_question_type = (typeof test_question_type)[keyof typeof test_question_type];
export const test_series_access_mode = {
    SEQUENTIAL: "SEQUENTIAL",
    OPEN: "OPEN"
} as const;
export type test_series_access_mode = (typeof test_series_access_mode)[keyof typeof test_series_access_mode];
export const test_series_enrollment_source = {
    PURCHASED: "PURCHASED",
    ADMIN_GRANT: "ADMIN_GRANT",
    FREE: "FREE",
    BUNDLE: "BUNDLE"
} as const;
export type test_series_enrollment_source = (typeof test_series_enrollment_source)[keyof typeof test_series_enrollment_source];
export const test_series_enrollment_status = {
    ACTIVE: "ACTIVE",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED"
} as const;
export type test_series_enrollment_status = (typeof test_series_enrollment_status)[keyof typeof test_series_enrollment_status];
export const test_series_pricing_type = {
    FREE: "FREE",
    PAID: "PAID"
} as const;
export type test_series_pricing_type = (typeof test_series_pricing_type)[keyof typeof test_series_pricing_type];
export const test_series_visibility = {
    PUBLIC: "PUBLIC",
    UNLISTED: "UNLISTED",
    PRIVATE: "PRIVATE"
} as const;
export type test_series_visibility = (typeof test_series_visibility)[keyof typeof test_series_visibility];
export const test_show_solutions = {
    IMMEDIATE: "IMMEDIATE",
    AFTER_SERIES_END: "AFTER_SERIES_END",
    NEVER: "NEVER"
} as const;
export type test_show_solutions = (typeof test_show_solutions)[keyof typeof test_show_solutions];
export const test_status = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    ARCHIVED: "ARCHIVED"
} as const;
export type test_status = (typeof test_status)[keyof typeof test_status];
export const testimonial_status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
} as const;
export type testimonial_status = (typeof testimonial_status)[keyof typeof testimonial_status];
export const track_asset_type = {
    LINK: "LINK",
    REPOSITORY: "REPOSITORY",
    DOCUMENT: "DOCUMENT",
    DESIGN: "DESIGN",
    DEPLOYMENT: "DEPLOYMENT"
} as const;
export type track_asset_type = (typeof track_asset_type)[keyof typeof track_asset_type];
export const track_attachment_scope = {
    CARD: "CARD",
    TASK: "TASK",
    SUBTASK: "SUBTASK",
    CHAT: "CHAT",
    DM: "DM"
} as const;
export type track_attachment_scope = (typeof track_attachment_scope)[keyof typeof track_attachment_scope];
export const track_custom_field_type = {
    TEXT: "TEXT",
    NUMBER: "NUMBER",
    DATE: "DATE",
    SELECT: "SELECT",
    MULTI_SELECT: "MULTI_SELECT",
    CHECKBOX: "CHECKBOX",
    URL: "URL",
    EMAIL: "EMAIL",
    PHONE: "PHONE",
    CURRENCY: "CURRENCY",
    PERCENTAGE: "PERCENTAGE",
    RATING: "RATING"
} as const;
export type track_custom_field_type = (typeof track_custom_field_type)[keyof typeof track_custom_field_type];
export const track_invitation_status = {
    PENDING: "PENDING",
    ACCEPTED: "ACCEPTED",
    REVOKED: "REVOKED",
    EXPIRED: "EXPIRED"
} as const;
export type track_invitation_status = (typeof track_invitation_status)[keyof typeof track_invitation_status];
export const track_member_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    INVITED: "INVITED"
} as const;
export type track_member_status = (typeof track_member_status)[keyof typeof track_member_status];
export const track_priority = {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    URGENT: "URGENT"
} as const;
export type track_priority = (typeof track_priority)[keyof typeof track_priority];
export const track_project_member_role = {
    ADMIN: "ADMIN",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER"
} as const;
export type track_project_member_role = (typeof track_project_member_role)[keyof typeof track_project_member_role];
export const track_project_status = {
    ACTIVE: "ACTIVE",
    ON_HOLD: "ON_HOLD",
    COMPLETED: "COMPLETED",
    ARCHIVED: "ARCHIVED",
    CANCELLED: "CANCELLED"
} as const;
export type track_project_status = (typeof track_project_status)[keyof typeof track_project_status];
export const track_task_status = {
    TODO: "TODO",
    IN_PROGRESS: "IN_PROGRESS",
    IN_REVIEW: "IN_REVIEW",
    DONE: "DONE"
} as const;
export type track_task_status = (typeof track_task_status)[keyof typeof track_task_status];
export const track_team_member_role = {
    LEADER: "LEADER",
    MEMBER: "MEMBER"
} as const;
export type track_team_member_role = (typeof track_team_member_role)[keyof typeof track_team_member_role];
export const track_user_status = {
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DEACTIVATED: "DEACTIVATED",
    INVITED: "INVITED"
} as const;
export type track_user_status = (typeof track_user_status)[keyof typeof track_user_status];
export const track_user_type = {
    SUPER_ADMIN: "SUPER_ADMIN",
    ADMIN: "ADMIN",
    MEMBER: "MEMBER"
} as const;
export type track_user_type = (typeof track_user_type)[keyof typeof track_user_type];
export const usage_event_type = {
    CONSUME: "CONSUME",
    RELEASE: "RELEASE",
    RESET: "RESET"
} as const;
export type usage_event_type = (typeof usage_event_type)[keyof typeof usage_event_type];
export const usage_scope_type = {
    TENANT: "TENANT",
    USER: "USER"
} as const;
export type usage_scope_type = (typeof usage_scope_type)[keyof typeof usage_scope_type];
export const usage_window_type = {
    LIFETIME: "LIFETIME",
    MONTHLY: "MONTHLY",
    YEARLY: "YEARLY",
    DAILY: "DAILY"
} as const;
export type usage_window_type = (typeof usage_window_type)[keyof typeof usage_window_type];
export const video_processing_status = {
    PROCESSING: "PROCESSING",
    PROCESSED: "PROCESSED",
    FAILED: "FAILED"
} as const;
export type video_processing_status = (typeof video_processing_status)[keyof typeof video_processing_status];
export const video_provider = {
    YOUTUBE: "YOUTUBE",
    VDOCIPHER: "VDOCIPHER",
    EURON_VOD: "EURON_VOD"
} as const;
export type video_provider = (typeof video_provider)[keyof typeof video_provider];
export const vote_type = {
    UPVOTE: "UPVOTE",
    DOWNVOTE: "DOWNVOTE"
} as const;
export type vote_type = (typeof vote_type)[keyof typeof vote_type];
export const wallet_transaction_type = {
    CREDIT_ORDER: "CREDIT_ORDER",
    DEBIT_PAYOUT: "DEBIT_PAYOUT",
    DEBIT_REFUND: "DEBIT_REFUND",
    CREDIT_REVERSAL: "CREDIT_REVERSAL",
    DEBIT_AFFILIATE_COMMISSION: "DEBIT_AFFILIATE_COMMISSION",
    CREDIT_AFFILIATE_COMMISSION: "CREDIT_AFFILIATE_COMMISSION",
    CREDIT_TOPUP: "CREDIT_TOPUP",
    DEBIT_AI_USAGE: "DEBIT_AI_USAGE"
} as const;
export type wallet_transaction_type = (typeof wallet_transaction_type)[keyof typeof wallet_transaction_type];
export const webhook_status = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    SKIPPED: "SKIPPED"
} as const;
export type webhook_status = (typeof webhook_status)[keyof typeof webhook_status];
export const webinar_type = {
    SINGLE: "SINGLE",
    SERIES: "SERIES"
} as const;
export type webinar_type = (typeof webinar_type)[keyof typeof webinar_type];
export const demo_availability_day = {
    MONDAY: "MONDAY",
    TUESDAY: "TUESDAY",
    WEDNESDAY: "WEDNESDAY",
    THURSDAY: "THURSDAY",
    FRIDAY: "FRIDAY",
    SATURDAY: "SATURDAY",
    SUNDAY: "SUNDAY"
} as const;
export type demo_availability_day = (typeof demo_availability_day)[keyof typeof demo_availability_day];
export const demo_booking_status = {
    CONFIRMED: "CONFIRMED",
    CANCELLED: "CANCELLED",
    COMPLETED: "COMPLETED",
    NO_SHOW: "NO_SHOW"
} as const;
export type demo_booking_status = (typeof demo_booking_status)[keyof typeof demo_booking_status];
