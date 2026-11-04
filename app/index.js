import { registerRootComponent } from "expo";
import App from "./src/App";
import "./src/modules/push"; // factory-owned: registers the push token once notifications are allowed

registerRootComponent(App);
