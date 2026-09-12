import { Suspense } from "react";
import { ConnectWorkspace } from "../../../components/connect/connect-workspace";
import "./connect.css";
export const metadata = { title: "O-Connect" };
export default function Page() {
  return <Suspense><ConnectWorkspace/></Suspense>;
}
