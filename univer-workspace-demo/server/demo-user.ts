export interface DemoUser {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
  readonly createdAt: number;
}

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
