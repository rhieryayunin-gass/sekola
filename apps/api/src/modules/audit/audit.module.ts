import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { AuthModule } from "../auth/auth.module";
import { Module } from "@nestjs/common"; import { AuditService } from "./audit.service"; import { AuditController } from "./audit.controller"; @Module({ imports: [AuthModule, AuthorizationModule], controllers:[AuditController],providers:[AuditService],exports:[AuditService]}) export class AuditModule {}
