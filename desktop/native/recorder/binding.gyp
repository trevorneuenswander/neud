{
  "targets": [
    {
      "target_name": "neud_recorder",
      "sources": [
        "recorder-addon.cc"
      ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir || require('node-addon-api').include\")",
        "<(module_root_dir)/../../node_modules/node-addon-api",
        "."
      ],
      "defines": ["NAPI_CPP_EXCEPTIONS", "NAPI_VERSION=8"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": ["recorder-mac.mm"],
            "defines": ["NEUD_RECORDER_HAS_PLATFORM=1"],
            "xcode_settings": {
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "CLANG_CXX_LIBRARY": "libc++",
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
              "GCC_ENABLE_CPP_RTTI": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "11.0",
              "OTHER_CPLUSPLUSFLAGS": ["-fexceptions", "-frtti", "-std=c++17"]
            },
            "link_settings": {
              "libraries": [
                "-framework AVFoundation",
                "-framework CoreMedia",
                "-framework CoreVideo",
                "-framework CoreFoundation",
                "-framework Foundation",
                "-framework VideoToolbox"
              ]
            }
          }
        ],
        [
          "OS=='win'",
          {
            "sources": ["recorder-win.cpp"],
            "defines": ["NEUD_RECORDER_HAS_PLATFORM=1"],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              }
            }
          }
        ],
        [
          "OS!=\"mac\" and OS!=\"win\"",
          {
            "sources": ["recorder-stub.cpp"]
          }
        ]
      ]
    }
  ]
}
