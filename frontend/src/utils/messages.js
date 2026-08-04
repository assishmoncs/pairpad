/**
 * Shared chat-message helpers.
 */

const getMessageKey = (message) => message?._id || null;

/**
 * Append a message to a list unless a message with the same _id already exists.
 * Used to deduplicate live socket broadcasts against persisted history.
 */
export const appendUniqueMessage = (messageList, message) => {
  const key = getMessageKey(message);
  if (!key || !messageList.some((existing) => getMessageKey(existing) === key)) {
    return [...messageList, message];
  }
  return messageList;
};
