import type { Me, PublicUser } from "@upto/contracts";

/** The user fields the API ever returns. Matches packages/contracts exactly. */
export interface PresentableUser {
  id: string;
  username: string;
  name: string;
  avatarSeed: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  isVerifiedStudent: boolean;
  campusEmail: string | null;
  classOf: number | null;
  isAdmin: boolean;
}

export function toPublicUser(user: Pick<PresentableUser, "id" | "username" | "name" | "avatarSeed" | "avatarUrl">): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarSeed: user.avatarSeed,
    avatarUrl: user.avatarUrl,
  };
}

export function toMe(user: PresentableUser): Me {
  return {
    ...toPublicUser(user),
    email: user.email,
    phone: user.phone,
    isVerifiedStudent: user.isVerifiedStudent,
    campusEmail: user.campusEmail,
    classOf: user.classOf,
    isAdmin: user.isAdmin,
  };
}
