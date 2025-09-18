//+------------------------------------------------------------------+
//|                                                 StringUtils.mqh |
//|                      Copyright 2025, YOUR_NAME                  |
//|                                                                  |
//|             Helper functions for string manipulation.            |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, YOUR_NAME"
#property link      ""

//+------------------------------------------------------------------+
//| Splits a string by a given separator.                            |
//| Fills the result_array with the parts.                           |
//| Returns the number of parts found.                               |
//+------------------------------------------------------------------+
int StringSplit(const string text, const uchar separator, string &result_array[])
{
  int i, start_pos=0, parts_count=0;
  
  // Resize the array to a plausible size first to avoid frequent resizing
  ArrayResize(result_array, 10);

  for(i = 0; i < StringLen(text); i++)
  {
    if(StringGetCharacter(text, i) == separator)
    {
      if(parts_count >= ArraySize(result_array))
      {
        ArrayResize(result_array, ArraySize(result_array) + 10);
      }
      result_array[parts_count] = StringSubstr(text, start_pos, i - start_pos);
      parts_count++;
      start_pos = i + 1;
    }
  }
  
  // Add the last part of the string
  if(parts_count >= ArraySize(result_array))
  {
     ArrayResize(result_array, parts_count + 1);
  }
  result_array[parts_count] = StringSubstr(text, start_pos);
  parts_count++;
  
  // Resize the array to the actual number of parts
  ArrayResize(result_array, parts_count);
  
  return parts_count;
}
//+------------------------------------------------------------------+
