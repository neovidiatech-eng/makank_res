export const returnAge = (dob: string): number => {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const month = today.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export const returnDob = (age: number) => {
  if (age === undefined) return undefined;
  const today = new Date();
  const birthDate = new Date(
    today.getFullYear() - age,
    today.getMonth(),
    today.getDate(),
  );
  return birthDate;
};
