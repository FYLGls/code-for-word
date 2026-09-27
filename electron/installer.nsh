!include LogicLib.nsh

; Persist the installer language so the app opens in that locale first.
!macro customInstall
  StrCpy $0 "en"
  ${If} $LANGUAGE = 2052
    StrCpy $0 "zh"
  ${ElseIf} $LANGUAGE = 1028
    StrCpy $0 "zh"
  ${ElseIf} $LANGUAGE = 1036
    StrCpy $0 "fr"
  ${ElseIf} $LANGUAGE = 1034
    StrCpy $0 "es"
  ${ElseIf} $LANGUAGE = 3082
    StrCpy $0 "es"
  ${ElseIf} $LANGUAGE = 1049
    StrCpy $0 "ru"
  ${EndIf}
  FileOpen $1 "$INSTDIR\install-locale.json" w
  FileWrite $1 '{"locale":"$0"}'
  FileClose $1
!macroend
