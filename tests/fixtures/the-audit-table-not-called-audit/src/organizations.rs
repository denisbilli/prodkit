use crate::events::{log_event, EventType};

pub async fn delete_organization(org_id: &str, headers: &Headers, ip: &ClientIp) {
    db::delete_org(org_id).await;

    log_event(
        EventType::OrganizationDeleted as i32,
        org_id,
        &headers.user.uuid,
        headers.device.atype,
        &ip.ip,
    )
    .await;
}

pub async fn invite_member(org_id: &str, headers: &Headers, ip: &ClientIp) {
    log_event(
        EventType::OrganizationUserInvited as i32,
        org_id,
        &headers.user.uuid,
        headers.device.atype,
        &ip.ip,
    )
    .await;
}
