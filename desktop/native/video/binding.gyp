{
  "variables": {
    "neud_with_ffmpeg%": "<!(node -p \"process.env.NEUD_WITH_FFMPEG==='1'?'1':'0'\")",
    "FFMPEG_DIR%": "<!(node -p \"process.env.FFMPEG_DIR||''\")"
  },
  "targets": [
    {
      "target_name": "neud_video",
      "sources": [
        "video-addon.cc",
        "video-decoder-stub.cpp"
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
            "sources": ["video-decoder-mac.mm"],
            "defines": ["NEUD_VIDEO_HAS_PLATFORM_DECODER=1"],
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
                "-framework QuartzCore",
                "-framework Foundation"
              ]
            }
          }
        ],
        [
          "OS=='win' and neud_with_ffmpeg==1",
          {
            "sources": ["video-decoder-win-ffmpeg.cpp"],
            "defines": [
              "NEUD_VIDEO_HAS_PLATFORM_DECODER=1",
              "NEUD_WITH_FFMPEG=1"
            ],
            "include_dirs": ["<(FFMPEG_DIR)/include"],
            "libraries": [
              "-lavcodec",
              "-lavformat",
              "-lavutil",
              "-lswscale"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              },
              "VCLinkerTool": {
                "AdditionalLibraryDirectories": ["<(FFMPEG_DIR)/lib"]
              }
            }
          }
        ],
        [
          "OS=='win' and neud_with_ffmpeg!=1",
          {
            "sources": ["video-decoder-win.cpp"],
            "defines": ["NEUD_VIDEO_HAS_PLATFORM_DECODER=1"],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              }
            }
          }
        ]
      ]
    }
  ]
}
