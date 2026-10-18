/** One line, no control characters or quotes, at most 60 chars. Node labels are candidate-controlled and end up
 * in finding titles and the LLM prompt, so they are flattened wherever they enter the system. */
export function cleanLabel(label: string | undefined): string {
  if (!label) return "";
  return label
    .replace(/[\u0000-\u001f\u007f"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
