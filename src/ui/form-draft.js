const getFormSnapshot = (root) => [...root.querySelectorAll("form")].map((form) => {
  const fieldIndexes = new Map();
  const values = [...form.elements]
    .filter((field) => field.name)
    .map((field) => {
      const key = `${field.name}:${field.type}`;
      const fieldIndex = fieldIndexes.get(key) || 0;
      fieldIndexes.set(key, fieldIndex + 1);
      return {
        name: field.name,
        type: field.type,
        value: field.value,
        checked: field.checked,
        fieldIndex
      };
    });
  return { values };
});

const restoreFormSnapshot = (root, snapshots) => {
  [...root.querySelectorAll("form")].forEach((form, formIndex) => {
    const snapshot = snapshots[formIndex];
    if (!snapshot) return;
    for (const fieldSnapshot of snapshot.values) {
      const field = [...form.elements]
        .filter((candidate) =>
          candidate.name === fieldSnapshot.name && candidate.type === fieldSnapshot.type
        )[fieldSnapshot.fieldIndex];
      if (!field) continue;
      if (field.type === "checkbox" || field.type === "radio") {
        field.checked = fieldSnapshot.checked;
      } else {
        field.value = fieldSnapshot.value;
      }
    }
  });
};

export const renderPreservingFormDraft = (root, render) => {
  const snapshots = getFormSnapshot(root);
  render();
  restoreFormSnapshot(root, snapshots);
};
