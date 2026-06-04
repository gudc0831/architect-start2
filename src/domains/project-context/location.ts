export type ProjectContextLocation =
  | {
      locationType: "line_range";
      lineStart: number;
      lineEnd: number;
      headingPath?: string[];
    }
  | {
      locationType: "message_range";
      messageIndexStart: number;
      messageIndexEnd: number;
      sender?: string;
      timestampStart?: string;
      timestampEnd?: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | {
      locationType: "sheet_range";
      sheetName: string;
      rowStart: number;
      rowEnd: number;
      cellRange?: string;
    }
  | {
      locationType: "paragraph";
      paragraphIndex: number;
      headingPath?: string[];
    }
  | {
      locationType: "page_paragraph";
      pageNumber: number;
      paragraphIndex: number;
    };

export function hasProjectContextLocation(value: ProjectContextLocation | null | undefined): value is ProjectContextLocation {
  if (!value) {
    return false;
  }

  switch (value.locationType) {
    case "line_range":
      return value.lineStart > 0 && value.lineEnd >= value.lineStart;
    case "message_range":
      return value.messageIndexStart > 0 && value.messageIndexEnd >= value.messageIndexStart;
    case "sheet_range":
      return value.sheetName.trim().length > 0 && value.rowStart > 0 && value.rowEnd >= value.rowStart;
    case "paragraph":
      return value.paragraphIndex > 0;
    case "page_paragraph":
      return value.pageNumber > 0 && value.paragraphIndex > 0;
  }
}
