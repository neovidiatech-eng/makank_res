import { ApiOperation } from '@nestjs/swagger';

export interface PointItem {
  title: string;
}

export const ApiPoint = (items: PointItem[]) => {
  const formattedChecklist = items
    .map((item, index) => {
      return `${index + 1}. 📌 ${item.title}`;
    })
    .join('\n');

  return ApiOperation({
    summary: 'Logic Senario',
    description: formattedChecklist,
  });
};
