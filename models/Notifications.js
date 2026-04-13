const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    type: {
        type: String,
        enum: [
            "COMMENT",
            "LIKE",
            "APPROVED",
            "REJECTED",
            "REPORT_SUBMITTED",
            "REPORT_RESOLVED",
            "REPORT_REJECTED"
        ],
        required: true
    },
    document_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Document"
    },
    comment_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment"
    },
    is_read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: "created_at" }
});

module.exports = mongoose.model("Notifications", notificationSchema);