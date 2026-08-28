import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./experiment4.cases.js";

describeWorkflow("experiment4", () => runWorkflowCases(cases));
