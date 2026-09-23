import { Column, CreatedAt, DataType, Table } from "sequelize-typescript";
import IdModel from "./base/IdModel";

@Table({ tableName: "sessions", modelName: "session" })
class Session extends IdModel {
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

  @Column(DataType.UUID)
  userId: string;

  @CreatedAt
  createdAt: Date;
}

export default Session;
