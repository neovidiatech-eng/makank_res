type InputTypes =
  | 'string'
  | 'text'
  | 'number'
  | 'email'
  | 'password'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'month'
  | 'week'
  | 'url'
  | 'tel'
  | 'color';

export interface Options {
  permPerfix: string;
  edit: boolean;
  create: boolean;
  path: string;
  navigateTo: string;
  reportName: string;
  pdf: boolean;
  excel: boolean;
  exportFiltered: boolean;
  exportAll: boolean;
  delete: boolean;
  disable: boolean;
  filter: boolean;
  headers: Headers;
  createModel?: CreateModel;
  updateModel?: UpdateModel;
}

export interface CreateModel {
  data: {
    [key: string]: { name: string; type: InputTypes; required: boolean };
  };
  view: Array<string[]>;
  postType: string;
}

export interface Code {
  required: boolean;
  type: string;
}

export interface Type {
  required: boolean;
  type: string;
  ngModelItems: NgModelItem[];
}

export interface NgModelItem {
  label: string;
  value: string;
}

export interface Headers {
  [key: string]: string;
}

export interface UpdateModel {
  data: { [key: string]: { name: string; type: InputTypes } };
  view: Array<string[]>;
  postType: string;
}
