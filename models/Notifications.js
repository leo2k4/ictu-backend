const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
        required: true
    },
    sender_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users"
    },
    type: {
        type: String,
        enum: ["COMMENT", "LIKE", "APPROVED", "REJECTED"],
        required: true
    },
    document_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Documents"
    },
    comment_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comments"
    },
    is_read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: "created_at" }
});

module.exports = mongoose.model("Notifications", notificationSchema);