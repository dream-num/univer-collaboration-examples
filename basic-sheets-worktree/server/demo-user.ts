export const DEMO_USER = {
  userId: "demo-user",
  name: "Demo User",
  createdAt: 0,
} as const;

export type DemoUser = typeof DEMO_USER;

export function protocolUser(user: DemoUser) {
  return {
    userID: user.userId,
    name: user.name,
    avatar: "",
    anonymous: false,
    canBindAnonymous: false,
    phone: "",
    email: "",
    createTimestamp: user.createdAt,
  };
}
