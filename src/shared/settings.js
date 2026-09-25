// Settings shared by the content script and the popup.

export const DEFAULT_SKIP = 10;

export const DEFAULT_KEYBINDS = {
  skip_forward: "ArrowRight",
  skip_backward: "ArrowLeft",
  volume_up: "ArrowUp",
  volume_down: "ArrowDown",
  speed_up: "]",
  speed_down: "[",
  speed_up_alt: "$",
  speed_down_alt: "^",
  pause_play: " ",
  mute: "m",
  reset_speed: "r",
  fullscreen: "f",
  seek_0: "0",
  seek_10: "1",
  seek_20: "2",
  seek_30: "3",
  seek_40: "4",
  seek_50: "5",
  seek_60: "6",
  seek_70: "7",
  seek_80: "8",
  seek_90: "9",
};

// Safari has no downloads API, so the download UI is hidden there.
export const SUPPORTS_DOWNLOAD = __BROWSER__ !== "safari";
