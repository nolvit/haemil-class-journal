import { describe, expect, it } from "vitest";
import {
  movePlaylistTrack,
  orderedPlaylistTracks,
} from "../shared/avatarBgmPlaylist";

const tracks = [
  { id: "moon", title: "달빛" },
  { id: "garden", title: "정원" },
  { id: "library", title: "도서관" },
];

describe("avatar BGM playlist order", () => {
  it("keeps a saved order and appends newly included tracks", () => {
    expect(
      orderedPlaylistTracks(tracks, [
        "library",
        "missing",
        "moon",
        "library",
      ]).map(track => track.id)
    ).toEqual(["library", "moon", "garden"]);
  });

  it("moves the dragged track without losing any track", () => {
    expect(
      movePlaylistTrack(["moon", "garden", "library"], "library", "moon")
    ).toEqual(["library", "moon", "garden"]);
    expect(movePlaylistTrack(["moon", "garden"], "missing", "moon")).toEqual([
      "moon",
      "garden",
    ]);
  });
});
