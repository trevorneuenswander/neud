{
  "targets": [
    {
      "target_name": "neud_decklink",
      "sources": ["decklink-addon.cc", "decklink-stub.cc"],
      "include_dirs": [
        "<(module_root_dir)/../../node_modules/node-addon-api"
      ],
      "defines": ["NAPI_CPP_EXCEPTIONS", "NAPI_VERSION=8"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_CXX_LIBRARY": "libc++",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          },
          "link_settings": {
            "libraries": ["-framework CoreFoundation"]
          }
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }],
        ["NEUD_DECKLINK_SDK==1", {
          "defines": ["NEUD_HAS_DECKLINK_SDK=1"],
          "include_dirs": ["<(decklink_include)"],
          "sources!": ["decklink-stub.cc"],
          "conditions": [
            ["OS=='mac'", {
              "sources": [
                "decklink-addon.cc",
                "decklink-sdk.cc",
                "DeckLinkAPIDispatch.cpp"
              ]
            }],
            ["OS=='win'", {
              "sources": [
                "decklink-addon.cc",
                "decklink-sdk.cc",
                "decklink-dispatch-win.cpp",
                "DeckLinkAPI_i.c"
              ],
              "msvs_settings": {
                "VCCLCompilerTool": {
                  "ExceptionHandling": 1,
                  "AdditionalOptions": ["/std:c++17"]
                },
                "VCLinkerTool": {
                  "AdditionalDependencies": ["Ole32.lib", "OleAut32.lib"]
                }
              }
            }]
          ]
        }]
      ]
    }
  ]
}
