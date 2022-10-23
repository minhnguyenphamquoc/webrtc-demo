export interface JoinPayload {
  spaceId: number;
  producerId: string;
}

// type LeavePayload = JoinPayload;

export interface GetParticipantsPayload {
  spaceId: number;
}

export interface ParticipantDetails {
  [id: string]: {
    id: string;
    producerId: string;
  };
}

export interface GetParticipantsResponse {
  participants: ParticipantDetails;
}

export interface GetParticipantsErrorResponse {
  error: string;
}
