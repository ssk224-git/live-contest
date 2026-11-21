// A host (teacher) account. Students never have accounts.
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }, // bcrypt hash, never the password itself
  },
  { timestamps: true },
);

// What we send to the browser: no password hash.
userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
