"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const emailSender_1 = __importDefault(require("./emailSender"));
const sendEmail = async (email, subject, template, data) => {
    try {
        const emailContent = await ejs_1.default.renderFile(path_1.default.join(__dirname, `../mail/${template}`), data);
        const emailResponse = await (0, emailSender_1.default)({
            email,
            subject,
            template,
            data
        });
        if (emailResponse.accepted.length > 0) {
            return true;
        }
        else {
            return false;
        }
    }
    catch (error) {
        return false;
    }
};
exports.sendEmail = sendEmail;
