import mongoose, { Schema } from 'mongoose'


const userSchema = new Schema(
  {

    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    gender: {
      type: String,
      enum: ['female', 'male', 'not specified'],
      default: 'not specified',
    },

    profile_pic: { secure_url: String, public_id: String },



    role: {
      type: String,
      default: 'User',
      enum: ['User', 'Admin', 'Instructor']

    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },


  },
  {
    timestamps: true,
  },
)
userSchema.set("toJSON", {
  transform: (_, user) => {
    delete user.password;
    delete user.tokenVersion;
    delete user.__v;
    return user;
  },
});
export const userModel = mongoose.model('User', userSchema)

