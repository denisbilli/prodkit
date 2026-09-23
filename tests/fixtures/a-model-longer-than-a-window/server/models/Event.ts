import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Table } from "sequelize-typescript";
import IdModel from "./base/IdModel";
import User from "./User";

@Table({ tableName: "events", modelName: "event", updatedAt: false })
class Event extends IdModel {
  @Column
  name: string;

  @Column(DataType.INET)
  ip: string | null;

  @Column
  field1: string | null;

  @Column
  field2: string | null;

  @Column
  field3: string | null;

  @Column
  field4: string | null;

  @Column
  field5: string | null;

  @Column
  field6: string | null;

  @Column
  field7: string | null;

  @Column
  field8: string | null;

  @Column
  field9: string | null;

  @Column
  field10: string | null;

  @Column
  field11: string | null;

  @Column
  field12: string | null;

  @BelongsTo(() => User, "actorId")
  actor: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  actorId: string | null;

  @CreatedAt
  createdAt: Date;

  static async createFromContext(ctx: { state: { user: User }; request: { ip: string } }, name: string) {
    return Event.create({ name, actorId: ctx.state.user.id, ip: ctx.request.ip });
  }
}

export default Event;
