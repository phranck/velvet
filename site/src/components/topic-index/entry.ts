/** One entry of a topic index, being one place on the page it stands beside. */
export interface TopicIndexEntry {
  /** The anchor on the page this entry points at. */
  id: string;
  /** What the entry reads as. */
  label: string;
  /** A second line beneath it, such as the day a release went out. */
  detail?: string;
}
