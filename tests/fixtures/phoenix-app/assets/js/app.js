import "phoenix_html";
import { Socket } from "phoenix";

const socket = new Socket("/live", {});
socket.connect();
