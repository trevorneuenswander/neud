"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BAG_RUNTIME_CONFIG = void 0;
exports.buildBagRuntimeConfigForWorker = buildBagRuntimeConfigForWorker;
exports.assertBagLoginConfigAligned = assertBagLoginConfigAligned;
const bag_runtime_config_json_1 = __importDefault(require("../../../../shared/bag/bag-runtime-config.json"));
const default_sources_1 = require("../default-sources");
exports.BAG_RUNTIME_CONFIG = bag_runtime_config_json_1.default;
/** Selector groups passed to the worker bundle for BAG scraping. */
function buildBagRuntimeConfigForWorker() {
    return exports.BAG_RUNTIME_CONFIG;
}
/** Validates manifest login selectors stay aligned with runtime config. */
function assertBagLoginConfigAligned() {
    const join = (values) => values.join(", ");
    return (join(exports.BAG_RUNTIME_CONFIG.login.usernameSelectors) ===
        default_sources_1.BAG_LOGIN_CONFIG.usernameSelectors &&
        join(exports.BAG_RUNTIME_CONFIG.login.passwordSelectors) ===
            default_sources_1.BAG_LOGIN_CONFIG.passwordSelectors &&
        join(exports.BAG_RUNTIME_CONFIG.login.submitSelectors) ===
            default_sources_1.BAG_LOGIN_CONFIG.submitSelectors &&
        exports.BAG_RUNTIME_CONFIG.login.successSelector === default_sources_1.BAG_LOGIN_CONFIG.successSelector &&
        exports.BAG_RUNTIME_CONFIG.login.failureUrlSubstring ===
            default_sources_1.BAG_LOGIN_CONFIG.failureUrlSubstring);
}
