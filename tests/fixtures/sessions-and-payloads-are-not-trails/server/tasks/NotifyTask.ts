import BaseTask from "./BaseTask";

export default class NotifyTask extends BaseTask {
  public async perform(event: { actorId: string; createdAt: Date; ip: string }) {
    await this.send({
      actorId: event.actorId,
      ip: event.ip,
      sentAt: new Date(),
    });
  }
}
